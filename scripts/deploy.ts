const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReverseDutchAuction", function() {
  let auction, token, owner, buyer, seller;
  const initialPrice = ethers.utils.parseEther("100");
  const duration = 60; // 1 minute
  const priceDecreasePerSecond = ethers.utils.parseEther("0.01");

  beforeEach(async function() {
    [owner, seller, buyer] = await ethers.getSigners();
    
    // Mock ERC20 token
    const MockToken = await ethers.getContractFactory("MockERC20");
    token = await MockToken.deploy("MockToken", "MTK", ethers.utils.parseEther("1000000"));
    await token.deployed();

    const Auction = await ethers.getContractFactory("ReverseDutchAuction");
    auction = await Auction.deploy(token.address, initialPrice, duration, priceDecreasePerSecond);
    await auction.deployed();

    // Transfer tokens to the auction contract for selling
    await token.transfer(auction.address, ethers.utils.parseEther("100"));
  });

  it("Should decrease price over time", async function() {
    expect(await auction.currentPrice()).to.equal(initialPrice);
    await ethers.provider.send("evm_increaseTime", [30]); // increase by 30 seconds
    await ethers.provider.send("evm_mine");
    expect(await auction.currentPrice()).to.be.lt(initialPrice);
  });

  it("Should allow only one buyer", async function() {
    await auction.connect(buyer).buy(ethers.utils.parseEther("1"));
    await expect(auction.connect(owner).buy(ethers.utils.parseEther("1"))).to.be.revertedWith("Auction already bought");
  });

  it("Should correctly swap funds and tokens", async function() {
    const buyerBalanceBefore = await token.balanceOf(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    
    await auction.connect(buyer).buy(ethers.utils.parseEther("1"), { value: ethers.utils.parseEther("99") });
    
    const buyerBalanceAfter = await token.balanceOf(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);

    expect(buyerBalanceAfter).to.be.gt(buyerBalanceBefore);
    expect(sellerBalanceAfter).to.be.gt(sellerBalanceBefore);
  });

  it("Should handle no buyer scenario", async function() {
    await ethers.provider.send("evm_increaseTime", [duration + 1]); // move past auction time
    await ethers.provider.send("evm_mine");
    await auction.withdraw();
    expect(await token.balanceOf(auction.address)).to.equal(0); // all tokens should be back to seller
  });
});