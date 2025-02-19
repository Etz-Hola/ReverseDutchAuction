// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ReverseDutchAuction {
    IERC20 public immutable tokenToSell;
    address public immutable seller;
    uint256 public immutable initialPrice;
    uint256 public immutable duration;
    uint256 public immutable priceDecreasePerSecond;
    uint256 public immutable startTime;
    
    address public buyer;
    bool public auctionEnded;
    
    event AuctionEnded(address indexed buyer, uint256 amount, uint256 price);
    event Withdrawal(address indexed seller, uint256 amount);
    
    constructor(
        address _tokenToSell,
        uint256 _initialPrice,
        uint256 _duration,
        uint256 _priceDecreasePerSecond
    ) {
        require(_duration > 0, "Duration must be greater than zero");
        require(_tokenToSell != address(0), "Token address cannot be zero");
        
        tokenToSell = IERC20(_tokenToSell);
        seller = msg.sender;
        initialPrice = _initialPrice;
        duration = _duration;
        priceDecreasePerSecond = _priceDecreasePerSecond;
        startTime = block.timestamp;
    }
    
    function currentPrice() public view returns (uint256) {
        if (block.timestamp >= startTime + duration) {
            return 0;
        }
        
        uint256 elapsed = block.timestamp - startTime;
        uint256 discount = elapsed * priceDecreasePerSecond;
        
        if (discount >= initialPrice) {
            return 0;
        }
        
        return initialPrice - discount;
    }
    
    function buy(uint256 amount) external payable {
        require(!auctionEnded, "Auction already bought");
        require(block.timestamp < startTime + duration, "Auction has expired");
        
        uint256 price = currentPrice();
        require(price > 0, "Auction has ended with zero price");
        
        uint256 totalCost = amount * price;
        require(msg.value >= totalCost, "Insufficient payment");
        
        buyer = msg.sender;
        auctionEnded = true;
        
        require(tokenToSell.transfer(buyer, amount), "Token transfer failed");
        
        (bool sent, ) = seller.call{value: msg.value}("");
        require(sent, "Failed to send ETH to seller");
        
        emit AuctionEnded(buyer, amount, price);
    }
    
    function withdraw() external {
        require(msg.sender == seller, "Only seller can withdraw");
        require(block.timestamp >= startTime + duration, "Auction not yet expired");
        require(!auctionEnded, "Auction already ended with a buyer");
        
        uint256 remainingTokens = tokenToSell.balanceOf(address(this));
        require(remainingTokens > 0, "No tokens to withdraw");
        
        auctionEnded = true;
        require(tokenToSell.transfer(seller, remainingTokens), "Token transfer failed");
        
        emit Withdrawal(seller, remainingTokens);
    }
}