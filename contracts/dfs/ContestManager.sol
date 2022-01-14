// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../staking/StakingRewardsVault.sol";
import "../eip712/ITransferWithSig.sol";
import "../commons/MetaTransactionsMixin.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

/**
 * @dev {ContestManager}:
 */
contract ContestManager is Ownable, AccessControl, MetaTransactionsMixin {
    
    bytes32 public constant CONTEST_VALIDATOR = keccak256("CONTEST_VALIDATOR");
    uint16 public constant MAX_ENTRIES_LIMIT = 10000;

    using SafeERC20 for IERC20;

    // Info of each staking pool.

    enum ContestType { H2H, DUP, TOP3, TOP10 }
    enum ContestStatus { RUNNING, CANCELED, FINISHED }
    
    struct ContestInfo {
        address owner;

        ContestType contestType;    // contest type
        ContestStatus status;
        
        bool guaranteed;
        
        uint256 maxParticipants;
        uint256 entryFee;
        uint256 ownersCut;
        
        uint256 startTimeStamp;
        uint256 claimableTimeStamp;

        uint256 participants;
    }

    // Created contests by id
    mapping(uint256 => ContestInfo) public createdContestHash;
    
    // Counter for contestIds
    uint256 public contestCounter;
    
    // Info for each entry.
    struct EntryInfo {
        address owner;
        uint16[] draftedTeam;
    }

    // participants by id
    mapping(uint256 => EntryInfo) public entriesHash;
    mapping(uint256 => mapping(address => EntryInfo[])) public entriesPerContestHash;

    // Address of Rewards Vault.
    StakingRewardsVault public rewardsVault;

    // Participants & Contests' creators balance
    mapping(address => uint256) public accountBalanceHash;

    // Events

    event CreateContest(
        uint256 contestId,
        address indexed owner, 
        
        ContestType indexed contestType, 
        bool guaranteed,
        
        uint256 maxParticipants,
        uint256 entryFee,
        uint256 ownersCut,

        uint256 startTimeStamp,
        uint256 claimableTimeStamp
    );

    event CloseContest(uint256 contestId);
    event CancelContest(uint256 contestId);
    event Claim(address claimer, uint256 amount);

    /**
     * @dev constructor
     * @param _rewardsVault reward token address  
     */
    constructor(address _rewardsVault) Ownable() {  
        rewardsVault = StakingRewardsVault(_rewardsVault);
        
        // Owner can grantRole(CONTEST_ADMIN, [address]);
        _setupRole(
            DEFAULT_ADMIN_ROLE, 
            msgSender()
        );
    }


    /**
     * @dev Create contest.  
     * @param _contestType type
     * @param _maxParticipants type
     * @param _entryFee type
     * @param _ownersCut Payable in reserve token
     * @param _startTimeStamp when the contest stop accepting entries
     * @param _claimableTimeStamp when the rewards are claimable
     */
    function createContest(
        ContestType _contestType,
        bool _guaranteed,
        uint256 _maxParticipants, 
        uint256 _entryFee, 
        uint256 _ownersCut,
        uint256 _startTimeStamp,
        uint256 _claimableTimeStamp
    )
        external 
    {        
        address contestOwner = msgSender();
        uint256 prizeAmount = (_entryFee * _maxParticipants) - _ownersCut;
        
        // Transfer prizeAmount to rewardsVault
        IERC20 rewardToken = rewardsVault.rewardToken();

        rewardToken.safeTransferFrom(
            contestOwner, 
            address(rewardsVault), 
            prizeAmount
        );

        _createContest(
            contestOwner,
            _contestType,
            _guaranteed,
            _maxParticipants,
            _entryFee,
            _ownersCut,
            _startTimeStamp,
            _claimableTimeStamp
        );
    }


    /**
     * @dev Create contest transfering _rewardAmount using EIP712 signature 
     * @param _contestType type
     * @param _guaranteed type
     * @param _maxParticipants type
     * @param _entryFee type
     * @param _ownersCut Payable in reserve token
     * @param _startTimeStamp, when the rewards are claimable
     * @param _claimableTimeStamp when the rewards are claimable
     * @param _eip712Expiration for EIP712 order call
     * @param _eip712OrderId for EIP712 order call
     * @param _eip712TransferSignature EIP712 transfer signature for reserve token
     */
    function createContestEIP712(
        ContestType _contestType,
        bool _guaranteed,
        uint256 _maxParticipants,
        uint256 _entryFee,
        uint256 _ownersCut,
        uint256 _startTimeStamp,
        uint256 _claimableTimeStamp,
        // These are required for EIP712
        uint256 _eip712Expiration,
        bytes32 _eip712OrderId,
        bytes memory _eip712TransferSignature
    ) 
        external
    {
        address contestOwner = msgSender();
        uint256 prizeAmount = (_entryFee * _maxParticipants) - _ownersCut;

        // Transfer prizeAmount from sender using EIP712 signature to rewardsVault
        IERC20 rewardToken = rewardsVault.rewardToken();

        ITransferWithSig(address(rewardToken)).transferWithSig(
            _eip712TransferSignature,
            prizeAmount,
            keccak256(
                abi.encodePacked(
                    _eip712OrderId, 
                    address(rewardToken), 
                    prizeAmount
                )
            ),
            _eip712Expiration,
            contestOwner,           // from
            address(rewardsVault)   // spender
        ); 

        _createContest(
            contestOwner,
            _contestType,
            _guaranteed,
            _maxParticipants,
            _entryFee,
            _ownersCut, 
            _startTimeStamp,
            _claimableTimeStamp
        );
    }


    /**
     * @dev Creates an entry to participate in the contest.
     * @param _contestId contest identifier
     */
    function closeContest(
        uint256 _contestId, 
        address[] calldata _winnersList
    )
        external
    {
        ContestInfo storage ci = createdContestHash[_contestId];
    
        // Check the contest is started
        require(
            block.timestamp >= ci.startTimeStamp,
            "contest not started yet"
        );

        // Check the contest can be closed
        require(
            ContestStatus.RUNNING == ci.status,  
            "contest status invalid"
        );

        // set finished status
        ci.status = ContestStatus.FINISHED;

        // special case where the contest is started but not filled the min amount of participants
        // If the contest is not. Can be called by anyone.
        if (ci.participants < _minParticipantsAllowed(ci.contestType)) {            
            _refundContest(ci);
        
        } else {
            // For payouts contest should be ended
            require(
                block.timestamp >= ci.claimableTimeStamp, 
                "not ended yet"
            );

            // For assign payouts should have CONTEST_VALIDATOR ROLE
            require(
                hasRole(CONTEST_VALIDATOR, msgSender()), 
                "caller not allowed"
            );

// asign winners based on configured payout for the contest
            uint256 totalPrize = (ci.maxParticipants * ci.entryFee) - ci.ownersCut;
            uint256 collectedFees = ci.participants * ci.entryFee;

            // Add owners balance
            if (collectedFees > totalPrize) {
                accountBalanceHash[ci.owner] += collectedFees - totalPrize;
            }

            _distributePayouts(ci, _winnersList, totalPrize);
        }

        emit CloseContest(_contestId);
    }


    /**
     *
     */
    function _refundContest(ContestInfo storage _contest) private {
        
        // for (uint16 i = 0; i < _contest.participants; i++) {
        //     ci.entries[ci.contestId][];
        // }
    }

    /**
     *
     */
    function _minParticipantsAllowed(ContestType _ctype) pure private returns (uint8) {
        if (_ctype == ContestType.TOP10) { 
            return 10;
        }
        if (_ctype == ContestType.TOP3) { 
            return 3;
        }
        return 2; // H2H, DUP
    }


    /**
     * @dev Cancels a created contest, penalizing with a cancelation fee 
     *  that's sent to the contract owner. The contest creator receives a refund.
     * It can only be called by the contest creator. 
     * 
     */
    function _distributePayouts(
        ContestInfo storage _cObj,
        address[] calldata _winnersList,
        uint256 _payoutAmount
    ) 
        private 
    {
        if (_cObj.contestType == ContestType.H2H) {
            require(_winnersList.length == 1, "H2H array err");

            accountBalanceHash[_winnersList[0]] += _payoutAmount;

        } else if (_cObj.contestType == ContestType.TOP3) {
            require(_winnersList.length == 3, "TOP3 array err");

            accountBalanceHash[_winnersList[0]] = 50 * _payoutAmount / 100;
            accountBalanceHash[_winnersList[1]] = 30 * _payoutAmount / 100;
            accountBalanceHash[_winnersList[2]] = 20 * _payoutAmount / 100;

        } else if (_cObj.contestType == ContestType.TOP10) {
            require(_winnersList.length == 10, "TOP10 array err");

            accountBalanceHash[_winnersList[0]] = 30 * _payoutAmount / 100;
            accountBalanceHash[_winnersList[1]] = 18 * _payoutAmount / 100;
            accountBalanceHash[_winnersList[2]] = 10 * _payoutAmount / 100; 

            uint256 prizePerUser = 6 * _payoutAmount / 100;

            for (uint16 i = 3; i < _winnersList.length; i++) {
                accountBalanceHash[_winnersList[i]] = prizePerUser;
            }
        
        } else if (_cObj.contestType == ContestType.DUP) {
            require(
                _winnersList.length <= _cObj.maxParticipants / 2, 
                "DUP array err"
            );

            uint256 prizePerUser = _payoutAmount / _winnersList.length;

            for (uint16 i = 0; i < _winnersList.length; i++) {
                accountBalanceHash[_winnersList[i]] = prizePerUser;
            }
        }
    }


    /**
     * @dev Cancels a created contest, penalizing with a cancelation fee 
     *  that's sent to the contract owner. The contest creator receives a refund.
     * It can only be called by the contest creator. 
     * 
     * @param _contestId contest identifier
     */
    function cancelContest(uint256 _contestId) external {
        ContestInfo storage ci = createdContestHash[_contestId];

        require(ci.owner == msgSender(), "not contest owner");
        require(ci.participants == 0, "contest is not empty");
        require(ci.startTimeStamp > block.timestamp, "contest started");
        
        // check is not already canceled or closed
        require(ci.status == ContestStatus.RUNNING, 
            "contest status invalid"
        );

        ci.status = ContestStatus.CANCELED;

        // send a refund contest owner charging a cancelation fee. 
        // the cancelation fee goes to contract owner 
        uint256 refund = (ci.maxParticipants * ci.entryFee) - ci.ownersCut;
        uint256 cancelationFee = 5 * refund / 100;

        // send cancelation fee to contract owner
        rewardsVault.sendRewards(
            owner(),
            cancelationFee
        );
        
        // refund contest creator
        rewardsVault.sendRewards(
            ci.owner, 
            refund - cancelationFee
        );

        emit CancelContest(_contestId);
    }

   
    /**
     * @dev Returns accumulated gains for the calling address
     */
    function claimable() view external returns (uint256) {
        return accountBalanceHash[msgSender()];
    }


    /**
     * @dev Claims accumulated gains for the calling address
     */
    function claim() external {
        // refund contest creator
        address claimer = _msgSender();
        uint256 amount = accountBalanceHash[claimer];

        accountBalanceHash[claimer] = 0;

        rewardsVault.sendRewards(claimer, amount);

        emit Claim(claimer, amount);
    }


    /**
     * @dev Creates an entry to participate in the contest.
     * @param _contestId contest identifier
     * @param _draftedTeam array of selected playerIds
     */
    function joinContest(
        uint256 _contestId,
        uint16[] memory _draftedTeam,
        // admin signature appoval for this join
        bytes32 _adminSignature
    )
        external
    {
        ContestInfo storage ci = createdContestHash[_contestId];

        require(ci.status == ContestStatus.RUNNING, "Contest status err");

        // Transfer entrFee tokens to rewardsVault
        IERC20 rewardToken = rewardsVault.rewardToken();

        rewardToken.safeTransferFrom(
            msgSender(), 
            address(rewardsVault), 
            ci.entryFee
        );
    }


    /**
     * @dev Create contest. Only called by admin addrs. 
     * @param _contestOwner type
     * @param _contestType type
     * @param _guaranteed type
     * @param _maxParticipants type
     * @param _entryFee type
     * @param _ownersCut Payable in reserve token
     * @param _startTimeStamp when the rewards are claimable
     * @param _claimableTimeStamp when the rewards are claimable
     */
    function _createContest(
        address _contestOwner,
        ContestType _contestType,
        bool _guaranteed,
        uint256 _maxParticipants,
        uint256 _entryFee,
        uint256 _ownersCut, 
        uint256 _startTimeStamp,
        uint256 _claimableTimeStamp
    ) 
        private 
    {
        require(_maxParticipants <= 10000, "_maxParticipants err");

        require(
            _startTimeStamp > block.timestamp + 5 minutes,
            "_startTimeStamp err"
        );

        require(
            _claimableTimeStamp <= block.timestamp + 1 weeks, 
            "_claimableTimeStamp err"
        );

        ContestInfo memory ci = ContestInfo({
            owner: _contestOwner,
            
            contestType: _contestType,
            guaranteed: _guaranteed,

            maxParticipants: _maxParticipants,
            entryFee: _entryFee,
            ownersCut: _ownersCut,
            
            startTimeStamp: _startTimeStamp,
            claimableTimeStamp: _claimableTimeStamp,

            participants: 0,
            status: ContestStatus.RUNNING
        });

        // get new id with counter
        uint256 contestId = contestCounter++;    

        createdContestHash[contestId] = ci;

        emit CreateContest(
            contestId, 
            _contestOwner, 
            _contestType,
            _guaranteed,
            _maxParticipants,
            _entryFee,
            _ownersCut,
            _startTimeStamp,
            _claimableTimeStamp
        );
    }
}