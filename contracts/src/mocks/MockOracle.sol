// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOracle} from "../interfaces/IOracle.sol";

/// @notice Settable price oracle for tests. Price is USD per token, 1e18-scaled.
contract MockOracle is IOracle {
    uint256 public price;

    constructor(uint256 _price) {
        price = _price;
    }

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function getPrice() external view returns (uint256) {
        require(price > 0, "NO_PRICE");
        return price;
    }
}
