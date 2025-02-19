// test/Auction.ts
import { expect } from "chai";
import { ethers, Contract, Signer } from "hardhat";

describe("ReverseDutchAuction", function () {
    let auction: Contract;
    let token: Contract;
    let owner: Signer;
    let seller: Signer;
    let buyer: Signer;
    const initialPrice = ethers.parseEther("100");
    const auctionDuration = 60; // 1 minute for testing
    const priceDecreasePerSecond = ethers.parseEther("0.01");

    beforeEach(async function () {
        // Get signers
        [owner, seller, buyer] = await ethers.getSigners();

        // Deploy the MockERC20 token
        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("MockToken", "MTK", ethers.parseEther("1000000"));
        await token.waitForDeployment();

        // Fund the seller with some ETH for testing gas costs
        await owner.sendTransaction({
            to: await seller.getAddress(),
            value: ethers.parseEther("100")
        });

        // Deploy the ReverseDutchAuction contract
        const Auction = await ethers.getContractFactory("ReverseDutchAuction");
        auction = await Auction.deploy(token.target, initialPrice, auctionDuration, priceDecreasePerSecond);
        await auction.waitForDeployment();

        // Transfer tokens to the auction contract for selling
        await token.transfer(auction.target, ethers.parseEther("100"));
    });

    describe("Deployment", function () {
        it("should deploy the contract successfully", async function () {
            const Auction = await ethers.getContractFactory("ReverseDutchAuction");
            const auction = await Auction.deploy(token.target, initialPrice, auctionDuration, priceDecreasePerSecond);
            expect(auction.target).to.not.be.undefined;
        });

        it("should log the correct deployment address", async function () {
            const Auction = await ethers.getContractFactory("ReverseDutchAuction");
            const auction = await Auction.deploy(token.target, initialPrice, auctionDuration, priceDecreasePerSecond);
            console.log("Deployed contract address:", auction.target);
            expect(auction.target).to.match(/^0x[a-fA-F0-9]{40}$/); 
        });
    });

    describe("constructor", function () {
        it("should initialize auction with correct parameters", async function () {
            const sellerAddress = await seller.getAddress();
            expect(await auction.tokenToSell()).to.equal(token.target);
            expect(await auction.seller()).to.equal(sellerAddress);
            expect(await auction.initialPrice()).to.be.closeTo(initialPrice, ethers.parseEther("0.00000001"));
            expect(await auction.duration()).to.equal(auctionDuration);
            expect(await auction.priceDecreasePerSecond()).to.be.closeTo(priceDecreasePerSecond, ethers.parseEther("0.00000001"));
            expect(await auction.buyer()).to.equal(ethers.ZeroAddress);
            expect(await auction.auctionEnded()).to.be.false;
        });

        it("should not allow zero duration", async function () {
            const Auction = await ethers.getContractFactory("ReverseDutchAuction");
            await expect(Auction.deploy(token.target, initialPrice, 0, priceDecreasePerSecond)).to.be.revertedWith("Duration must be greater than zero");
        });
    });

    describe("currentPrice function", function () {
        it("should return the correct price over time", async function () {
            const startPrice = await auction.currentPrice();
            expect(startPrice).to.be.closeTo(initialPrice, ethers.parseEther("0.00000001"));

            // Increase time by half the duration
            await ethers.provider.send("evm_increaseTime", [auctionDuration / 2]);
            await ethers.provider.send("evm_mine");

            const midPrice = await auction.currentPrice();
            expect(midPrice).to.be.lt(initialPrice);

            // Increase time past auction end
            await ethers.provider.send("evm_increaseTime", [auctionDuration / 2 + 1]);
            await ethers.provider.send("evm_mine");

            const endPrice = await auction.currentPrice();
            expect(endPrice).to.equal(0); // Price should be 0 after auction ends
        });
    });

    describe("buy function", function () {
        it("should allow buying at current price", async function () {
            const buyAmount = ethers.parseEther("1");
            const currentPrice = await auction.currentPrice();
            const cost = buyAmount * currentPrice;

            // Fund the buyer with enough ETH for the purchase
            await owner.sendTransaction({
                to: await buyer.getAddress(),
                value: cost
            });

            const buyerBalanceBefore = await token.balanceOf(await buyer.getAddress());
            await auction.connect(buyer).buy(buyAmount, { value: cost });
            const buyerBalanceAfter = await token.balanceOf(await buyer.getAddress());

            expect(buyerBalanceAfter).to.be.gt(buyerBalanceBefore);
            expect(await auction.buyer()).to.equal(await buyer.getAddress());
            expect(await auction.auctionEnded()).to.be.true;
        });

        it("should not allow buying after auction ends", async function () {
            await ethers.provider.send("evm_increaseTime", [auctionDuration + 1]);
            await ethers.provider.send("evm_mine");

            const buyAmount = ethers.parseEther("1");
            await expect(auction.connect(buyer).buy(buyAmount, { value: ethers.parseEther("100") })).to.be.revertedWith("Auction has expired");
        });

        it("should not allow multiple buys", async function () {
            const buyAmount = ethers.parseEther("1");
            const currentPrice = await auction.currentPrice();
            const cost = buyAmount * currentPrice;

            // Fund the buyer with enough ETH for the purchase
            await owner.sendTransaction({
                to: await buyer.getAddress(),
                value: cost.mul(2) // Enough for two buys if needed
            });

            await auction.connect(buyer).buy(buyAmount, { value: cost });
            await expect(auction.connect(owner).buy(buyAmount, { value: cost })).to.be.revertedWith("Auction already bought");
        });
    });

    describe("withdraw function", function () {
        it("should allow seller to withdraw tokens if auction ends without a buyer", async function () {
            await ethers.provider.send("evm_increaseTime", [auctionDuration + 1]);
            await ethers.provider.send("evm_mine");

            const sellerBalanceBefore = await token.balanceOf(await seller.getAddress());
            await auction.connect(seller).withdraw();
            const sellerBalanceAfter = await token.balanceOf(await seller.getAddress());

            expect(sellerBalanceAfter).to.be.gt(sellerBalanceBefore);
        });

        it("should not allow non-seller to withdraw", async function () {
            await ethers.provider.send("evm_increaseTime", [auctionDuration + 1]);
            await ethers.provider.send("evm_mine");

            await expect(auction.connect(buyer).withdraw()).to.be.revertedWith("Only seller can withdraw");
        });
    });
});