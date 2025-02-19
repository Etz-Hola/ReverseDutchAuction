import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("ReverseDutchAuction", function () {
    let auction: Contract;
    let token: Contract;
    let owner: Signer;
    let seller: Signer;
    let buyer: Signer;
    let initialPrice: bigint;
    let auctionDuration: number;
    let priceDecreasePerSecond: bigint;

    beforeEach(async function () {
        // Get signers
        [owner, seller, buyer] = await ethers.getSigners();

        // Set auction parameters
        initialPrice = ethers.parseEther("100");
        auctionDuration = 60; // 1 minute for testing
        priceDecreasePerSecond = ethers.parseEther("0.01");

        // Deploy the MockERC20 token
        const MockToken = await ethers.getContractFactory("MockERC20");
        token = await MockToken.deploy("MockToken", "MTK", ethers.parseEther("1000000"));
        await token.waitForDeployment();

        // Deploy the ReverseDutchAuction contract
        const Auction = await ethers.getContractFactory("ReverseDutchAuction");
        auction = await Auction.connect(seller).deploy(
            await token.getAddress(),
            initialPrice,
            auctionDuration,
            priceDecreasePerSecond
        );
        await auction.waitForDeployment();

        // Transfer tokens to the auction contract
        await token.transfer(await auction.getAddress(), ethers.parseEther("100"));

        // Fund buyer with ETH
        await owner.sendTransaction({
            to: await buyer.getAddress(),
            value: ethers.parseEther("1000")
        });
    });

    describe("Deployment", function () {
        it("should initialize with correct parameters", async function () {
            expect(await auction.tokenToSell()).to.equal(await token.getAddress());
            expect(await auction.seller()).to.equal(await seller.getAddress());
            expect(await auction.initialPrice()).to.equal(initialPrice);
            expect(await auction.duration()).to.equal(auctionDuration);
            expect(await auction.priceDecreasePerSecond()).to.equal(priceDecreasePerSecond);
            expect(await auction.buyer()).to.equal(ethers.ZeroAddress);
            expect(await auction.auctionEnded()).to.be.false;
        });

        it("should revert with zero duration", async function () {
            const Auction = await ethers.getContractFactory("ReverseDutchAuction");
            await expect(
                Auction.deploy(await token.getAddress(), initialPrice, 0, priceDecreasePerSecond)
            ).to.be.revertedWith("Duration must be greater than zero");
        });
    });

    describe("Price Mechanism", function () {
        it("should decrease price linearly over time", async function () {
            const startPrice = await auction.currentPrice();
            expect(startPrice).to.equal(initialPrice);

            // Advance time by 30 seconds
            await time.increase(30);
            
            const midPrice = await auction.currentPrice();
            const expectedMidPrice = initialPrice - (BigInt(30) * priceDecreasePerSecond);
            expect(midPrice).to.equal(expectedMidPrice);
        });

        it("should return zero price after auction duration", async function () {
            await time.increase(auctionDuration + 1);
            expect(await auction.currentPrice()).to.equal(0n);
        });
    });

    describe("Buying", function () {
        it("should allow purchase at current price", async function () {
            const buyAmount = ethers.parseEther("1");
            const currentPrice = await auction.currentPrice();
            const cost = buyAmount * currentPrice / ethers.parseEther("1");

            const buyerBalanceBefore = await token.balanceOf(await buyer.getAddress());
            await auction.connect(buyer).buy(buyAmount, { value: cost });
            const buyerBalanceAfter = await token.balanceOf(await buyer.getAddress());

            expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(buyAmount);
            expect(await auction.buyer()).to.equal(await buyer.getAddress());
            expect(await auction.auctionEnded()).to.be.true;
        });

        it("should revert if auction expired", async function () {
            await time.increase(auctionDuration + 1);
            const buyAmount = ethers.parseEther("1");
            await expect(
                auction.connect(buyer).buy(buyAmount, { value: ethers.parseEther("100") })
            ).to.be.revertedWith("Auction has expired");
        });

        it("should revert on insufficient payment", async function () {
            const buyAmount = ethers.parseEther("1");
            const currentPrice = await auction.currentPrice();
            const cost = buyAmount * currentPrice / ethers.parseEther("1");

            await expect(
                auction.connect(buyer).buy(buyAmount, { value: cost - 1n })
            ).to.be.revertedWith("Insufficient payment");
        });

        it("should emit AuctionEnded event", async function () {
            const buyAmount = ethers.parseEther("1");
            const currentPrice = await auction.currentPrice();
            const cost = buyAmount * currentPrice / ethers.parseEther("1");

            await expect(auction.connect(buyer).buy(buyAmount, { value: cost }))
                .to.emit(auction, "AuctionEnded")
                .withArgs(await buyer.getAddress(), buyAmount, currentPrice);
        });
    });

    describe("Withdrawal", function () {
        it("should allow seller to withdraw after expiration", async function () {
            await time.increase(auctionDuration + 1);

            const sellerBalanceBefore = await token.balanceOf(await seller.getAddress());
            const contractBalance = await token.balanceOf(await auction.getAddress());

            await auction.connect(seller).withdraw();

            const sellerBalanceAfter = await token.balanceOf(await seller.getAddress());
            expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(contractBalance);
        });

        it("should revert withdrawal before expiration", async function () {
            await expect(
                auction.connect(seller).withdraw()
            ).to.be.revertedWith("Auction not yet expired");
        });

        it("should revert non-seller withdrawal", async function () {
            await time.increase(auctionDuration + 1);
            await expect(
                auction.connect(buyer).withdraw()
            ).to.be.revertedWith("Only seller can withdraw");
        });

        it("should emit Withdrawal event", async function () {
            await time.increase(auctionDuration + 1);
            const contractBalance = await token.balanceOf(await auction.getAddress());

            await expect(auction.connect(seller).withdraw())
                .to.emit(auction, "Withdrawal")
                .withArgs(await seller.getAddress(), contractBalance);
        });
    });
});