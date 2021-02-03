// contracts/HYPE.sol
// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./ERC1132.sol";

/// @title ERC20 token.
/// @notice Implementation for the ERC-1132 lockable token
contract HYPER is AccessControl, ERC20, ERC1132 {
  /**
    * @dev Token issue information
    */
  string private _name = "HYPOWER ESCO";
  string private _symbol = "HYPER";
  string private _version = "1.0";
  uint8 private _decimals = 18;

  uint256 private _exponent = 10**uint256(_decimals);
  uint256 private _totalSupply = 0;
  uint256 private _totalSupplyCap = 50 * (10**6) * _exponent;

  mapping (address => mapping (address => uint256)) private _allowances;

  /**
    * @dev Token role information
    */
  bytes32 private constant MINTER_ROLE = keccak256("MINTER_ROLE");
  bytes32 private constant BURNER_ROLE = keccak256("BURNER_ROLE");

  using SafeMath for uint;

  constructor() ERC20(_name, _symbol) {
    _mint(msg.sender, _totalSupply * (10 ** uint(_decimals)));
    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _setupRole(BURNER_ROLE, msg.sender);
    _setupRole(MINTER_ROLE, msg.sender);
  }

  function version() public view returns (string memory) {
    return _version;
  }

  function mint(address to, uint256 amount) public {
    require(hasRole(MINTER_ROLE, msg.sender));
    require(amount > 0);
    require(_totalSupply.add(amount) <= _totalSupplyCap);
    _totalSupply = _totalSupply.add(amount);
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) public {
    require(hasRole(BURNER_ROLE, msg.sender));
    require(amount > 0);
    require(_totalSupply.sub(amount) >= 0);
    _totalSupply = _totalSupply.sub(amount);
    _burn(from, amount);
  }

  /**
     * @dev Locks a specified amount of tokens against an address,
     *      for a specified reason and time
     * @param _reason The reason to lock tokens
     * @param _amount Number of tokens to be locked
     * @param _time Lock time in seconds
     */
  function lock(bytes32 _reason, uint256 _amount, uint256 _time) override public returns (bool) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    require(tokensLocked(msg.sender, _reason) == 0);
    require(_amount != 0);
    uint256 validUntil = block.timestamp.add(_time);

    if (locked[msg.sender][_reason].amount == 0) {
      lockReason[msg.sender].push(_reason);
    } 

    transfer(address(this), _amount);
    locked[msg.sender][_reason] = lockToken(_amount, validUntil, false);

    emit Locked(msg.sender, _reason, _amount, validUntil);

    return true;
  }

  /**
    * @dev Transfers and Locks a specified amount of tokens,
    *      for a specified reason and time
    * @param _to adress to which tokens are to be transfered
    * @param _reason The reason to lock tokens
    * @param _amount Number of tokens to be transfered and locked
    * @param _time Lock time in seconds
    */
  function transferWithLock(address _to, bytes32 _reason, uint256 _amount, uint256 _time) public returns (bool) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    require(tokensLocked(_to, _reason) == 0);
    require(_amount != 0);
    uint256 validUntil = block.timestamp.add(_time);

    if (locked[_to][_reason].amount == 0) {
      lockReason[_to].push(_reason);
    }

    transfer(address(this), _amount);
    locked[_to][_reason] = lockToken(_amount, validUntil, false);

    emit Locked(_to, _reason, _amount, validUntil);
    
    return true;
  }

  /**
    * @dev Returns tokens locked for a specified address for a
    *      specified reason
    *
    * @param _of The address whose tokens are locked
    * @param _reason The reason to query the lock tokens for
    */
  function tokensLocked(address _of, bytes32 _reason) override public view returns (uint256 amount) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    uint256 _amounts;

    if (!locked[_of][_reason].claimed) {
      _amounts = locked[_of][_reason].amount;
    }
    
    return _amounts;
  }

  /**
    * @dev Returns tokens locked for a specified address for a
    *      specified reason at a specific time
    *
    * @param _of The address whose tokens are locked
    * @param _reason The reason to query the lock tokens for
    * @param _time The timestamp to query the lock tokens for
    */
  function tokensLockedAtTime(address _of, bytes32 _reason, uint256 _time) override public view returns (uint256 amount) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    uint256 _amounts;

    if (locked[_of][_reason].validity > _time) {
      _amounts = locked[_of][_reason].amount;
    }

    return _amounts;
  }

  /**
    * @dev Returns total tokens held by an address (locked + transferable)
    * @param _of The address to query the total balance of
    */
  function totalBalanceOf(address _of) override public view returns (uint256 amount) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    uint256 _amounts;

    _amounts = balanceOf(_of);

    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      _amounts = _amounts.add(tokensLocked(_of, lockReason[_of][i]));
    }

    return _amounts;
  }

  /**
    * @dev Extends lock for a specified reason and time
    * @param _reason The reason to lock tokens
    * @param _time Lock extension time in seconds
    */
  function extendLock(bytes32 _reason, uint256 _time) override public returns (bool) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    require(tokensLocked(msg.sender, _reason) > 0);

    locked[msg.sender][_reason].validity = locked[msg.sender][_reason].validity.add(_time);

    emit Locked(msg.sender, _reason, locked[msg.sender][_reason].amount, locked[msg.sender][_reason].validity);
    
    return true;
  }

  /**
    * @dev Increase number of tokens locked for a specified reason
    * @param _reason The reason to lock tokens
    * @param _amount Number of tokens to be increased
    */
  function increaseLockAmount(bytes32 _reason, uint256 _amount) public override returns (bool) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    require(tokensLocked(msg.sender, _reason) > 0);
    
    transfer(address(this), _amount);
    locked[msg.sender][_reason].amount = locked[msg.sender][_reason].amount.add(_amount);

    emit Locked(msg.sender, _reason, locked[msg.sender][_reason].amount, locked[msg.sender][_reason].validity);
    
    return true;
  }

  /**
    * @dev Returns unlockable tokens for a specified address for a specified reason
    * @param _of The address to query the the unlockable token count of
    * @param _reason The reason to query the unlockable tokens for
    */
  function tokensUnlockable(address _of, bytes32 _reason) override public view returns (uint256 amount) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    uint256 _amounts;

    if (locked[_of][_reason].validity <= block.timestamp && !locked[_of][_reason].claimed) {
      _amounts = locked[_of][_reason].amount;
    }

    return _amounts;
  }

  /**
    * @dev Unlocks the unlockable tokens of a specified address
    * @param _of Address of user, claiming back unlockable tokens
    */
  function unlock(address _of) public override returns (uint256 unlockableTokens) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    uint256 _lockedTokens;
    uint256 _unlockableTokens;

    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      _lockedTokens = tokensUnlockable(_of, lockReason[_of][i]);

      if (_lockedTokens > 0) {
        _unlockableTokens = _unlockableTokens.add(_lockedTokens);
        locked[_of][lockReason[_of][i]].claimed = true;
        emit Unlocked(_of, lockReason[_of][i], _lockedTokens);
      }
    }

    if (_unlockableTokens > 0) {
      this.transfer(_of, _unlockableTokens);
    }

    return _unlockableTokens;
  }

  function getUnlockableTokens(address _of) public override view returns (uint256 unlockableTokens) {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    uint256 _lockedTokens;
    uint256 _unlockableTokens;

    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      _lockedTokens = tokensUnlockable(_of, lockReason[_of][i]);
      _unlockableTokens = _unlockableTokens.add(_lockedTokens);
    }

    return unlockableTokens;
  }
}