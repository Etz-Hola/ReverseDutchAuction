import { ethers } from "hardhat";

async function main() {
    console.log('-------------------------- Starting Deployment --------------------------');

    const [owner, seller, buyer] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    const token = await MockToken.connect(owner).deploy("MockToken", "MTK", ethers.parseEther("1000000"));
    await token.waitForDeployment();
    console.log('MockERC20 deployed to:', token.target);

    const Auction = await ethers.getContractFactory("ReverseDutchAuction");
    const initialPrice = ethers.parseEther("100");
    const auctionDuration = 60; 
    const priceDecreasePerSecond = ethers.parseEther("0.01");
    const auction = await Auction.connect(seller).deploy(token.target, initialPrice, auctionDuration, priceDecreasePerSecond);
    await auction.waitForDeployment();
    console.log('ReverseDutchAuction deployed to:', auction.target);

    console.log('-------------------------- Seller Listing Tokens --------------------------');
    const tokenAmount = ethers.parseEther("100");
    await token.connect(owner).transfer(auction.target, tokenAmount);
    console.log(`Seller listed ${ethers.formatEther(tokenAmount)} tokens for auction`);

    const buyerFunding = ethers.parseEther("1000");
    await owner.sendTransaction({
        to: await buyer.getAddress(),
        value: buyerFunding
    });
    console.log(`Funded buyer with ${ethers.formatEther(buyerFunding)} ETH`);

    console.log('-------------------------- Auction Price Check --------------------------');

    const startPrice = await auction.currentPrice();
    console.log(`Initial auction price is: ${ethers.formatEther(startPrice)}`);

    console.log('-------------------------- Execute Swap at Different Time Intervals --------------------------');

    let buyAmount = ethers.parseEther("1");
    let currentPrice = await auction.currentPrice();
    let cost = buyAmount * currentPrice / ethers.parseEther("1");
    console.log(`Attempting to buy ${ethers.formatEther(buyAmount)} tokens at initial price of ${ethers.formatEther(currentPrice)}`);
    await attemptBuy(auction, buyer, buyAmount, cost);

    console.log("Simulating half the auction duration passing...");
    await ethers.provider.send("evm_increaseTime", [auctionDuration / 2]);
    await ethers.provider.send("evm_mine");
    currentPrice = await auction.currentPrice();
    cost = buyAmount * currentPrice / ethers.parseEther("1");
    console.log(`Attempting to buy ${ethers.formatEther(buyAmount)} tokens at half duration price of ${ethers.formatEther(currentPrice)}`);
    await attemptBuy(auction, buyer, buyAmount, cost);

    console.log("Simulating auction expiration...");
    await ethers.provider.send("evm_increaseTime", [auctionDuration / 2 + 1]);
    await ethers.provider.send("evm_mine");
    currentPrice = await auction.currentPrice();
    cost = buyAmount * currentPrice / ethers.parseEther("1");
    console.log(`Attempting to buy ${ethers.formatEther(buyAmount)} tokens after auction ends (should fail)`);
    try {
        await attemptBuy(auction, buyer, buyAmount, cost);
    } catch (error) {
        console.log("Purchase failed as expected:", error.reason);
    }

    console.log('-------------------------- Script Completed --------------------------');
}

async function attemptBuy(auction, buyer, buyAmount, cost) {
    const buyerBalanceBefore = await auction.tokenToSell().balanceOf(await buyer.getAddress());
    console.log(`Sending payment of ${ethers.formatEther(cost)} ETH`);
    try {
        await auction.connect(buyer).buy(buyAmount, { value: cost });
        const buyerBalanceAfter = await auction.tokenToSell().balanceOf(await buyer.getAddress());
        console.log(`Buy successful! Buyer's token balance increased from ${ethers.formatEther(buyerBalanceBefore)} to ${ethers.formatEther(buyerBalanceAfter)}`);
    } catch (error) {
        console.error("Buy failed:", error.reason);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});