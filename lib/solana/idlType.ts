/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/decant_solana.json`.
 */
export type DecantSolana = {
  "address": "EAYBRfX1Q5ExvAVwGrM4k4eGnTPTvXhJnVFLaaTFsi5t",
  "metadata": {
    "name": "decantSolana",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Decant index-priced perp on Solana"
  },
  "instructions": [
    {
      "name": "addInsurance",
      "discriminator": [
        170,
        53,
        191,
        55,
        250,
        170,
        109,
        1
      ],
      "accounts": [
        {
          "name": "contributor",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "contributorToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closePosition",
      "docs": [
        "Close the full position at the current index price and settle PnL.",
        "",
        "Solvency invariant (always preserved): vault_tokens == sum(free_collateral)",
        "+ insurance_fund + sum(locked position.margin). The house (insurance_fund)",
        "is the counterparty: it pays trader profit and collects trader losses + fees.",
        "Profit is capped by available house capital so the vault can never be drained",
        "below what it actually holds; trader liability is capped at their margin."
      ],
      "discriminator": [
        123,
        134,
        81,
        0,
        49,
        68,
        98,
        98
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "userBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "userBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeMarket",
      "docs": [
        "Create an isolated, index-priced perp market. The protocol is the house:",
        "trader PnL is paid from / absorbed into the vault + insurance fund."
      ],
      "discriminator": [
        35,
        35,
        189,
        193,
        155,
        48,
        170,
        203
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": "u64"
        },
        {
          "name": "oracleAuthority",
          "type": "pubkey"
        },
        {
          "name": "maxLeverage",
          "type": "u64"
        },
        {
          "name": "maintenanceMarginBps",
          "type": "u16"
        },
        {
          "name": "tradingFeeBps",
          "type": "u16"
        },
        {
          "name": "initialPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "liquidate",
      "docs": [
        "Force-close an underwater position. Callable by anyone (keeper). The",
        "position is liquidatable when its equity (margin + PnL) has fallen to or",
        "below the maintenance-margin requirement. Settlement uses the same",
        "solvent house accounting as `close_position`; the trader keeps whatever",
        "residual equity remains (usually ~0) and the house collects the rest."
      ],
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "liquidator",
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "userBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "openPosition",
      "docs": [
        "Open an isolated position. notional = margin * leverage. PnL is index-priced."
      ],
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "userBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "isLong",
          "type": "bool"
        },
        {
          "name": "margin",
          "type": "u64"
        },
        {
          "name": "leverage",
          "type": "u64"
        }
      ]
    },
    {
      "name": "pushPrice",
      "docs": [
        "Push the external index price (keeper sources it from Pyth off-chain for the",
        "devnet MVP; production should verify Pyth on-chain)."
      ],
      "discriminator": [
        113,
        238,
        232,
        235,
        60,
        71,
        127,
        203
      ],
      "accounts": [
        {
          "name": "oracleAuthority",
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setPaused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "userBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "userBalance",
      "discriminator": [
        187,
        237,
        208,
        146,
        86,
        132,
        29,
        191
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6001,
      "name": "paused",
      "msg": "market paused"
    },
    {
      "code": 6002,
      "name": "zeroAmount",
      "msg": "amount must be > 0"
    },
    {
      "code": 6003,
      "name": "insufficientFunds",
      "msg": "insufficient free collateral"
    },
    {
      "code": 6004,
      "name": "badLeverage",
      "msg": "leverage out of range"
    },
    {
      "code": 6005,
      "name": "positionOpen",
      "msg": "position already open"
    },
    {
      "code": 6006,
      "name": "noPosition",
      "msg": "no open position"
    },
    {
      "code": 6007,
      "name": "notLiquidatable",
      "msg": "position is not liquidatable"
    },
    {
      "code": 6008,
      "name": "badMarket",
      "msg": "position does not belong to this market"
    },
    {
      "code": 6009,
      "name": "badPrice",
      "msg": "bad price"
    },
    {
      "code": 6010,
      "name": "badParam",
      "msg": "bad parameter"
    },
    {
      "code": 6011,
      "name": "overflow",
      "msg": "arithmetic overflow"
    },
    {
      "code": 6012,
      "name": "badMint",
      "msg": "wrong collateral mint"
    },
    {
      "code": 6013,
      "name": "badVault",
      "msg": "wrong vault"
    }
  ],
  "types": [
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "oracleAuthority",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "u64"
          },
          {
            "name": "indexPrice",
            "type": "u64"
          },
          {
            "name": "lastPriceTs",
            "type": "i64"
          },
          {
            "name": "maxLeverage",
            "type": "u64"
          },
          {
            "name": "maintenanceMarginBps",
            "type": "u16"
          },
          {
            "name": "tradingFeeBps",
            "type": "u16"
          },
          {
            "name": "insuranceFund",
            "type": "u64"
          },
          {
            "name": "totalOpenInterest",
            "type": "u64"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "sizeUsd",
            "type": "i64"
          },
          {
            "name": "entryPrice",
            "type": "u64"
          },
          {
            "name": "margin",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "userBalance",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "freeCollateral",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
