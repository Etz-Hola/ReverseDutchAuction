import { ethers } from "hardhat";
const helpers = require("@nomicfoundation/hardhat-toolbox/network-helpers");

async function main() {
    console.log('-------------------------- Starting Deployment --------------------------');

    // Get signers
    const [owner, seller, buyer] = await ethers.getSigners();

    // Deploy MockERC20 Token
    const MockToken = await ethers.getContractFactory("MockERC20");
    const token = await MockToken.connect(owner).deploy("MockToken", "MTK", ethers.parseEther("1000000"));
    await token.waitForDeployment();
    console.log('MockERC20 deployed to:', token.target);

    // Deploy ReverseDutchAuction
    const Auction = await ethers.getContractFactory("ReverseDutchAuction");
    const initialPrice = ethers.parseEther("100");
    const auctionDuration = 60; // 1 minute
    const priceDecreasePerSecond = ethers.parseEther("0.01");
    const auction = await Auction.connect(seller).deploy(token.target, initialPrice, auctionDuration, priceDecreasePerSecond);
    await auction.waitForDeployment();
    console.log('ReverseDutchAuction deployed to:', auction.target);

    console.log('-------------------------- Initial Setup --------------------------');

    // Transfer tokens to the auction contract
    const tokenAmount = ethers.parseEther("100");
    await token.connect(owner).transfer(auction.target, tokenAmount);
    console.log(`Transferred ${ethers.formatEther(tokenAmount)} tokens to auction contract`);

    // Fund buyer with ETH
    const buyerFunding = ethers.parseEther("100");
    await owner.sendTransaction({
        to: await buyer.getAddress(),
        value: buyerFunding
    });
    console.log(`Funded buyer with ${ethers.formatEther(buyerFunding)} ETH`);

    console.log('-------------------------- Auction Price Check --------------------------');

    // Check initial price
    const startPrice = await auction.currentPrice();
    console.log(`Initial auction price is: ${ethers.formatEther(startPrice)}`);

    // Simulate time passing
    console.log("Simulating half the auction duration passing...");
    await ethers.provider.send("evm_increaseTime", [auctionDuration / 2]);
    await ethers.provider.send("evm_mine");

    // Check price after half duration
    const midPrice = await auction.currentPrice();
    console.log(`Price after half duration: ${ethers.formatEther(midPrice)}`);

    console.log('-------------------------- Buying Tokens --------------------------');

    // Buyer attempts to buy tokens
    const buyAmount = ethers.parseEther("1");
    const currentPrice = await auction.currentPrice();
    const cost = buyAmount * currentPrice / ethers.parseEther("1");
    const buyerBalanceBefore = await token.balanceOf(await buyer.getAddress());
    console.log(`Attempting to buy ${ethers.formatEther(buyAmount)} tokens for ${ethers.formatEther(cost)} ETH`);
    await auction.connect(buyer).buy(buyAmount, { value: cost });

    const buyerBalanceAfter = await token.balanceOf(await buyer.getAddress());
    console.log(`Buyer's token balance increased from ${ethers.formatEther(buyerBalanceBefore)} to ${ethers.formatEther(buyerBalanceAfter)}`);

    console.log('-------------------------- Auction Expiration --------------------------');

    // Simulate time passing beyond auction duration
    console.log("Simulating auction expiration...");
    await ethers.provider.send("evm_increaseTime", [auctionDuration / 2 + 1]);
    await ethers.provider.send("evm_mine");

    // Check price after auction ends
    const endPrice = await auction.currentPrice();
    console.log(`Price after auction ends: ${ethers.formatEther(endPrice)}`);

    console.log('-------------------------- Token Withdrawal --------------------------');

    // Seller attempts to withdraw remaining tokens
    const contractBalanceBefore = await token.balanceOf(auction.target);
    console.log(`Contract balance before withdrawal: ${ethers.formatEther(contractBalanceBefore)}`);
    const sellerBalanceBefore = await token.balanceOf(await seller.getAddress());
    await auction.connect(seller).withdraw();
    const sellerBalanceAfter = await token.balanceOf(await seller.getAddress());
    console.log(`Seller's token balance increased from ${ethers.formatEther(sellerBalanceBefore)} to ${ethers.formatEther(sellerBalanceAfter)}`);

    console.log('-------------------------- Script Completed --------------------------');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});