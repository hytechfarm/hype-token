const HYPER = artifacts.require('HYPER');
const { BN, ether, constants, time, expectRevert } = require('@openzeppelin/test-helpers');
const { expect, assert } = require('chai');

contract('HYPER', accounts => {
  let hyper;
  let tryCatch = require("./exceptions.js").tryCatch;
  let errTypes = require("./exceptions.js").errTypes;

  const owner = accounts[0];
  const receiver = accounts[1];
  const spender = accounts[2];
  const account = accounts[3];
  const lockReason = web3.utils.asciiToHex('NORMAL');
  const lockReason2 = web3.utils.asciiToHex('CLAIM');
  const lockReason3 = web3.utils.asciiToHex('VESTED');
  const lockedAmount = ether('200');
  const lockPeriod = 1000;
  const approveAmount = ether('100');

  const increaseTime = async (duration) => {
    await time.increase(duration);
  };

  before(async () => {
    hyper = await HYPER.new({ from: owner });
  });

  it('can be created', () => {
    assert.ok(hyper);
  });

  it('has the right balance for the contract owner', async () => {
    const supply = new BN(0);
    const name = 'HYPOWER ESCO';
    const symbol = 'HYPER';
    const decimals = new BN(18);

    const balance = await hyper.balanceOf(owner);
    const totalBalance = await hyper.totalBalanceOf(owner);
    const totalSupply = await hyper.totalSupply();
    const tokenName = await hyper.name();
    const tokenSymbol = await hyper.symbol();
    const tokenDecimals = await hyper.decimals();

    expect(totalSupply).to.be.bignumber.equal(supply);
    expect(balance).to.be.bignumber.equal(totalSupply);
    expect(totalBalance).to.be.bignumber.equal(totalSupply);
    assert.equal(tokenName, name);
    assert.equal(tokenSymbol, symbol);
    expect(tokenDecimals).to.be.bignumber.equal(decimals);
  });

  it('mint supply', async () => {
    const amount = ether('1000000')
    await hyper.mint(owner, amount, { from: owner });

    const totalSupply = await hyper.totalSupply();
    expect(totalSupply).to.be.bignumber.equal(amount);
  })

  it('reduces locked tokens from transferable balance', async () => {
    const origBalance = await hyper.balanceOf(owner);
    const blockNumber = await web3.eth.getBlockNumber();
    const newLockTimestamp = await web3.eth.getBlock(blockNumber);
    
    await hyper.lock(lockReason, lockedAmount, lockPeriod);
    const balance = await hyper.balanceOf(owner);
    const totalBalance = await hyper.totalBalanceOf(owner);
    const lockAndUseableBalance = web3.utils.toBN(balance.toString()).add(web3.utils.toBN(lockedAmount));

    expect(origBalance).to.be.bignumber.equal(totalBalance);
    expect(origBalance).to.be.bignumber.equal(lockAndUseableBalance);
    let actualLockedAmount = await hyper.tokensLocked(owner, lockReason);
    expect(lockedAmount).to.be.bignumber.equal(actualLockedAmount);
    actualLockedAmount = await hyper.tokensLockedAtTime(owner, lockReason, newLockTimestamp.timestamp + lockPeriod + 1)
    assert.equal(0, actualLockedAmount.toNumber());

    const transferAmount = ether('500');
    const { logs } = await hyper.transfer(receiver, transferAmount, { from: owner });
    const newSenderBalance = await hyper.balanceOf(owner);
    const newReceiverBalance = await hyper.balanceOf(receiver);
    const ownerUserabledBalance = web3.utils.toBN(newSenderBalance.toString()).add(web3.utils.toBN(transferAmount));
    expect(newReceiverBalance).to.be.bignumber.equal(transferAmount);
    expect(balance).to.be.bignumber.equal(ownerUserabledBalance);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event, 'Transfer');
    assert.equal(logs[0].args.from, owner);
    assert.equal(logs[0].args.to, receiver);
    assert(logs[0].args.value.eq(transferAmount));
  });

  it('reverts locking more tokens via lock function', async () => {
    const balance = await hyper.balanceOf(owner);
    await tryCatch(hyper.lock(lockReason, balance, lockPeriod), errTypes.revert);
  });

  it('can extend lock period for an existing lock', async () => {
    await hyper.tokensLocked(owner, lockReason);
    const lockValidityOrig = await hyper.locked(owner, lockReason);
    await hyper.extendLock(lockReason, lockPeriod);
    const lockValidityExtended = await hyper.locked(owner, lockReason);
    assert.equal(lockValidityExtended[1].toNumber(), lockValidityOrig[1].toNumber() + lockPeriod);
    await tryCatch(hyper.extendLock(lockReason2, lockPeriod), errTypes.revert);
    await tryCatch(hyper.increaseLockAmount(lockReason2, lockPeriod), errTypes.revert);
  });

  it('can increase the number of tokens locked', async () => {
    const actualLockedAmount = await hyper.tokensLocked(owner, lockReason);
    await hyper.increaseLockAmount(lockReason, lockedAmount);
    const increasedLockAmount = await hyper.tokensLocked(owner, lockReason);
    const validLockedAmount = web3.utils.toBN(actualLockedAmount.toString()).add(web3.utils.toBN(lockedAmount));
    expect(increasedLockAmount).to.be.bignumber.equal(validLockedAmount);
  });

  it('cannot transfer tokens to null address', async () => {
    await expectRevert(hyper.transfer(constants.ZERO_ADDRESS, ether('100'), { from: owner }), 'ERC20: transfer to the zero address');
  });

  it('cannot transfer tokens greater than transferable balance', async () => {
    const balance = await hyper.balanceOf(owner);
    const newBalance = web3.utils.toBN(balance.toString()).add(web3.utils.toBN('1'));
    await expectRevert(hyper.transfer(receiver, newBalance, { from: owner }), 'ERC20: transfer amount exceeds balance');
  });

  it('can approve transfer to a spender', async () => {
    const initialAllowance = await hyper.allowance(owner, spender);
    await hyper.approve(spender, approveAmount);
    const newAllowance = await hyper.allowance(owner, spender);
    const validAllowance = web3.utils.toBN(initialAllowance.toString()).add(web3.utils.toBN(approveAmount));

    expect(newAllowance).to.be.bignumber.equal(validAllowance);
  });

  it('cannot transfer tokens from an address greater than allowance', async () => {
    const newAllowance = web3.utils.toBN(approveAmount).add(web3.utils.toBN('100'));
    await expectRevert(hyper.transferFrom(owner, receiver, newAllowance, { from: spender }), 'ERC20: transfer amount exceeds allowance');
  });

  it('cannot transfer tokens from an address to null address', async () => {
    await expectRevert(hyper.transferFrom(owner, constants.ZERO_ADDRESS, ether('100')), 'ERC20: transfer to the zero address');
  });

  it('cannot transfer tokens from an address greater than owners balance', async () => {
    const balance = await hyper.balanceOf(owner);
    await hyper.approve(spender, balance);
    const newAmount = web3.utils.toBN(balance.toString()).add(web3.utils.toBN('100'));
    await expectRevert(hyper.transferFrom(owner, receiver, newAmount, { from: spender }), 'ERC20: transfer amount exceeds balance');
  });

  it('can transfer tokens from an address less than owners balance', async () => {
    const balance = await hyper.balanceOf(owner);
    await hyper.approve(spender, balance);
    const newAmount = web3.utils.toBN(balance.toString()).sub(web3.utils.toBN(ether('30000')));
    const { logs } = await hyper.transferFrom(owner, receiver, newAmount, { from: spender });
    const newBalance = web3.utils.toBN(balance.toString()).sub(web3.utils.toBN(newAmount));
    assert.equal(logs.length, 2);
    assert.equal(logs[0].event, 'Transfer');
    assert.equal(logs[0].args.from, owner);
    assert.equal(logs[0].args.to, receiver);
    assert(logs[0].args.value.eq(newAmount));
    assert.equal(logs[1].event, 'Approval');
    assert.equal(logs[1].args.owner, owner);
    assert.equal(logs[1].args.spender, spender);
    assert(logs[1].args.value.eq(newBalance));
  });

  it('can unLockTokens', async () => {
    const blockNumber = await web3.eth.getBlockNumber();
    const lockTimestamp = await web3.eth.getBlock(blockNumber);
    const lockValidityExtended = await hyper.locked(owner, lockReason);
    const balance = await hyper.balanceOf(owner);
    const tokensLocked = await hyper.tokensLockedAtTime(owner, lockReason, lockTimestamp.timestamp);
    await increaseTime(lockValidityExtended[1].toNumber() + 60 - lockTimestamp.timestamp);
    let unlockableToken = await hyper.getUnlockableTokens(owner);
    expect(unlockableToken).to.be.bignumber.equal(tokensLocked);
    await hyper.unlock(owner);
    unlockableToken = await hyper.getUnlockableTokens(owner);
    assert.equal(0, unlockableToken.toNumber());
    const newBalance = await hyper.balanceOf(owner);
    const validBalance = web3.utils.toBN(balance.toString()).add(web3.utils.toBN(tokensLocked.toString()));
    expect(newBalance).to.be.bignumber.equal(validBalance);
    await hyper.unlock(owner);
    const newNewBalance = await hyper.balanceOf(owner);
    expect(newBalance).to.be.bignumber.equal(newNewBalance);
  });

  it('should allow to lock token again', async () => {
    hyper.lock('0x41', ether('1'), 0);
    await hyper.unlock(owner);
    hyper.lock('0x41', ether('1'), 0);
  });

  it('can transferWithLock', async () => {
    await hyper.unlock(owner);
    const accountBalance = await hyper.balanceOf(account);
    const ownerBalance = await hyper.balanceOf(owner);
    const transferAmount = ether('600');

    await hyper.transferWithLock(account, lockReason3, transferAmount, 180);
    await tryCatch(hyper.transferWithLock(account, lockReason3, ownerBalance, lockPeriod), errTypes.revert);

    const locked = await hyper.locked(account, lockReason3);
    const accountTotalBalance = await hyper.totalBalanceOf(account);
    const ownerTotalBalance = await hyper.totalBalanceOf(owner);
    const validAccountBalance = web3.utils.toBN(accountBalance).add(web3.utils.toBN(transferAmount));
    const validOwnerBalance = web3.utils.toBN(ownerBalance).sub(web3.utils.toBN(transferAmount));
    expect(accountTotalBalance).to.be.bignumber.equal(validAccountBalance);
    expect(ownerTotalBalance).to.be.bignumber.equal(validOwnerBalance);
    expect(locked[0]).to.be.bignumber.equal(transferAmount);
  });

  it('should not allow 0 lock amount', async () => {
    const blockNumber = await web3.eth.getBlockNumber();
    const lockTimestamp = await web3.eth.getBlock(blockNumber);

    await tryCatch(hyper.lock('0x414141', 0, lockTimestamp.timestamp), errTypes.revert);
    await tryCatch(hyper.transferWithLock(account, '0x414141', 0, lockPeriod), errTypes.revert);
  });

  it('should show 0 lock amount for unknown reasons', async () => {
    const actualLockedAmount = await hyper.tokensLocked(owner, '0x4141');
    assert.equal(actualLockedAmount.toNumber(), 0);
  });

  it('should not allow to increase lock amount by more than balance', async () => {
    const balance = await hyper.balanceOf(owner);
    const newBalance = web3.utils.toBN(balance).add(web3.utils.toBN(ether('1')));

    await tryCatch(hyper.increaseLockAmount(lockReason, newBalance), errTypes.revert);
  });

  it('should not allow to transfer and lock more than balance', async () => {
    const balance = await hyper.balanceOf(owner);
    const newBalance = web3.utils.toBN(balance).add(web3.utils.toBN(ether('1')));

    await expectRevert(hyper.transferWithLock(account, '0x4142', newBalance, lockPeriod), 'ERC20: transfer amount exceeds balance');
  });

  it('should allow transfer with lock again after claiming', async () => {
    const reLockAmount = ether('800');
    await increaseTime(180);
    await hyper.unlock(account);
    await hyper.transferWithLock(account, lockReason3, reLockAmount, 180);
    const accountBalance = await hyper.balanceOf(account);
    const accountTotalBalance = await hyper.totalBalanceOf(account);
    const validAccountBalance = web3.utils.toBN(accountBalance).add(web3.utils.toBN(reLockAmount));
    expect(accountTotalBalance).to.be.bignumber.equal(validAccountBalance);
  });

  it('can burn the amount of owner', async () => {
    const balance = await hyper.balanceOf(owner);
    const burnAmount = ether('300');
    await hyper.approve(owner, burnAmount);
    await hyper.burn(owner, burnAmount);
    const newBalance = await hyper.balanceOf(owner);
    const validBalance = web3.utils.toBN(newBalance).add(web3.utils.toBN(burnAmount));
    expect(balance).to.be.bignumber.equal(validBalance);
  });

  it('can mint the token', async () => {
    const balance = await hyper.balanceOf(owner);
    const mintAmount = ether('300');
    await hyper.mint(owner, mintAmount);
    const newBalance = await hyper.balanceOf(owner);
    const validBalance = web3.utils.toBN(balance).add(web3.utils.toBN(mintAmount));
    expect(newBalance).to.be.bignumber.equal(validBalance);
  });
})