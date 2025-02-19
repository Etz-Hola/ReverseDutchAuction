// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ReverseDutchAuction {
    IERC20 public tokenToSell;
    address public seller;
    uint256 public initialPrice;
    uint256 public startTime;
    uint256 public duration;
    uint256 public priceDecreasePerSecond;
    address public buyer;
    bool public auctionEnded;

    event AuctionEnded(address buyer, uint256 amount, uint256 price);

    constructor(address _tokenToSell, uint256 _initialPrice, uint256 _duration, uint256 _priceDecreasePerSecond) {
        tokenToSell = IERC20(_tokenToSell);
        seller = msg.sender;
        initialPrice = _initialPrice;
        duration = _duration;
        priceDecreasePerSecond = _priceDecreasePerSecond;
        startTime = block.timestamp;
        auctionEnded = false;
    }

    function currentPrice() public view returns (uint256) {
        uint256 timeElapsed = block.timestamp - startTime;
        if (timeElapsed >= duration) return 0;
        return initialPrice - (timeElapsed * priceDecreasePerSecond);
    }

    function buy(uint256 amount) external payable {
        require(!auctionEnded, "Auction has already ended");
        require(buyer == address(0), "Auction already bought");

        uint256 price = currentPrice();
        require(price > 0, "Auction has expired");

        uint256 cost = amount * price;
        require(msg.value >= cost, "Insufficient payment");

        if (msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }

        require(tokenToSell.transfer(msg.sender, amount), "Token transfer failed");

        buyer = msg.sender;
        auctionEnded = true;
        
        payable(seller).transfer(cost);
        
        emit AuctionEnded(buyer, amount, price);
    }

    function withdraw() external {
        require(msg.sender == seller, "Only seller can withdraw");
        require(auctionEnded || block.timestamp >= startTime + duration, "Auction not ended");

        uint256 remainingTokens = tokenToSell.balanceOf(address(this));
        require(tokenToSell.transfer(seller, remainingTokens), "Withdrawal failed");
    }
}