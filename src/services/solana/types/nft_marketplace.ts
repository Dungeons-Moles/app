/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/nft_marketplace.json`.
 */
export type NftMarketplace = {
  "address": "GLKxBpZ8hc7qzvD9VHAVsJEjHSu2JVp1HaPrGH4fpTci",
  "metadata": {
    "name": "nftMarketplace",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "NFT Marketplace and Quest System for Dungeons & Moles"
  },
  "instructions": [
    {
      "name": "acceptQuest",
      "docs": [
        "Player accepts a quest, creating their progress account."
      ],
      "discriminator": [
        227,
        152,
        182,
        25,
        142,
        11,
        231,
        72
      ],
      "accounts": [
        {
          "name": "questDefinition",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  115,
                  116,
                  95,
                  100,
                  101,
                  102
                ]
              },
              {
                "kind": "arg",
                "path": "questId"
              }
            ]
          }
        },
        {
          "name": "questProgress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  115,
                  116,
                  95,
                  112,
                  114,
                  111,
                  103,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "player"
              },
              {
                "kind": "arg",
                "path": "questId"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "questId",
          "type": "u16"
        }
      ]
    },
    {
      "name": "buyNft",
      "docs": [
        "Buy a listed NFT. Transfers SOL (with fee split) and NFT."
      ],
      "discriminator": [
        96,
        0,
        28,
        190,
        49,
        107,
        83,
        222
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "marketplaceConfig",
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
                  116,
                  112,
                  108,
                  97,
                  99,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true,
          "relations": [
            "listing"
          ]
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "seller",
          "writable": true,
          "relations": [
            "listing"
          ]
        },
        {
          "name": "companyTreasury",
          "writable": true
        },
        {
          "name": "gauntletPool",
          "writable": true
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "cancelListing",
      "docs": [
        "Cancel a listing. Removes Transfer Delegate and closes listing account."
      ],
      "discriminator": [
        41,
        183,
        50,
        232,
        230,
        233,
        157,
        70
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true,
          "relations": [
            "listing"
          ]
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true,
          "relations": [
            "listing"
          ]
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimQuestReward",
      "docs": [
        "Player claims a completed quest reward.",
        "For hackathon: minting happens via separate mint_skin/mint_nft_item calls.",
        "This instruction just marks the quest as claimed."
      ],
      "discriminator": [
        73,
        123,
        191,
        206,
        63,
        127,
        247,
        12
      ],
      "accounts": [
        {
          "name": "questDefinition",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  115,
                  116,
                  95,
                  100,
                  101,
                  102
                ]
              },
              {
                "kind": "arg",
                "path": "questId"
              }
            ]
          }
        },
        {
          "name": "questProgress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  115,
                  116,
                  95,
                  112,
                  114,
                  111,
                  103,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "player"
              },
              {
                "kind": "arg",
                "path": "questId"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true,
          "relations": [
            "questProgress"
          ]
        }
      ],
      "args": [
        {
          "name": "questId",
          "type": "u16"
        }
      ]
    },
    {
      "name": "createQuest",
      "docs": [
        "Admin creates a quest definition."
      ],
      "discriminator": [
        112,
        49,
        32,
        224,
        255,
        173,
        5,
        7
      ],
      "accounts": [
        {
          "name": "questDefinition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  115,
                  116,
                  95,
                  100,
                  101,
                  102
                ]
              },
              {
                "kind": "arg",
                "path": "questId"
              }
            ]
          }
        },
        {
          "name": "marketplaceConfig",
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
                  116,
                  112,
                  108,
                  97,
                  99,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "questId",
          "type": "u16"
        },
        {
          "name": "questType",
          "type": {
            "defined": {
              "name": "questType"
            }
          }
        },
        {
          "name": "objectiveType",
          "type": {
            "defined": {
              "name": "objectiveType"
            }
          }
        },
        {
          "name": "objectiveCount",
          "type": "u16"
        },
        {
          "name": "rewardType",
          "type": {
            "defined": {
              "name": "rewardType"
            }
          }
        },
        {
          "name": "rewardData",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "season",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initializeMarketplace",
      "docs": [
        "One-time marketplace configuration setup."
      ],
      "discriminator": [
        47,
        81,
        64,
        0,
        96,
        56,
        105,
        7
      ],
      "accounts": [
        {
          "name": "marketplaceConfig",
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
                  116,
                  112,
                  108,
                  97,
                  99,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "gauntletPool"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "skinsCollection",
          "type": "pubkey"
        },
        {
          "name": "itemsCollection",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "listNft",
      "docs": [
        "List an NFT for sale. Adds Transfer Delegate plugin so marketplace PDA can transfer."
      ],
      "discriminator": [
        88,
        221,
        93,
        166,
        63,
        220,
        106,
        232
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "asset"
              }
            ]
          }
        },
        {
          "name": "marketplaceConfig",
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
                  116,
                  112,
                  108,
                  97,
                  99,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerProfile",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "seller"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                173,
                178,
                185,
                109,
                85,
                174,
                41,
                240,
                83,
                161,
                21,
                228,
                174,
                149,
                101,
                192,
                117,
                119,
                254,
                61,
                55,
                200,
                75,
                179,
                126,
                215,
                130,
                121,
                72,
                90,
                152,
                13
              ]
            }
          }
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "priceLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "mintNftItem",
      "docs": [
        "Mint an NFT item via CPI to Metaplex Core."
      ],
      "discriminator": [
        225,
        105,
        7,
        236,
        107,
        78,
        104,
        144
      ],
      "accounts": [
        {
          "name": "asset",
          "writable": true,
          "signer": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "marketplaceConfig",
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
                  116,
                  112,
                  108,
                  97,
                  99,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        },
        {
          "name": "nftItemId",
          "type": {
            "array": [
              "u8",
              8
            ]
          }
        }
      ]
    },
    {
      "name": "mintSkin",
      "docs": [
        "Mint a skin NFT via CPI to Metaplex Core.",
        "Only callable by the mint_authority PDA (used by admin scripts or quest rewards)."
      ],
      "discriminator": [
        142,
        213,
        165,
        190,
        25,
        244,
        82,
        176
      ],
      "accounts": [
        {
          "name": "asset",
          "writable": true,
          "signer": true
        },
        {
          "name": "collection",
          "writable": true
        },
        {
          "name": "marketplaceConfig",
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
                  116,
                  112,
                  108,
                  97,
                  99,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "docs": [
            "Mint authority PDA -- update authority on both collections."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "payer",
          "docs": [
            "Admin who triggers the mint."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "uri",
          "type": "string"
        },
        {
          "name": "skinId",
          "type": "u16"
        },
        {
          "name": "season",
          "type": "u8"
        },
        {
          "name": "rarity",
          "type": "u8"
        }
      ]
    },
    {
      "name": "updateQuestProgress",
      "docs": [
        "Update quest progress. For hackathon, admin can also call this."
      ],
      "discriminator": [
        167,
        204,
        80,
        200,
        137,
        62,
        63,
        207
      ],
      "accounts": [
        {
          "name": "questDefinition",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  115,
                  116,
                  95,
                  100,
                  101,
                  102
                ]
              },
              {
                "kind": "arg",
                "path": "questId"
              }
            ]
          }
        },
        {
          "name": "questProgress",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  115,
                  116,
                  95,
                  112,
                  114,
                  111,
                  103,
                  114,
                  101,
                  115,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "player"
              },
              {
                "kind": "arg",
                "path": "questId"
              }
            ]
          }
        },
        {
          "name": "player",
          "docs": [
            "For hackathon: admin or player can update progress."
          ],
          "signer": true,
          "relations": [
            "questProgress"
          ]
        }
      ],
      "args": [
        {
          "name": "questId",
          "type": "u16"
        },
        {
          "name": "increment",
          "type": "u16"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "listing",
      "discriminator": [
        218,
        32,
        50,
        73,
        43,
        134,
        26,
        58
      ]
    },
    {
      "name": "marketplaceConfig",
      "discriminator": [
        169,
        22,
        247,
        131,
        182,
        200,
        81,
        124
      ]
    },
    {
      "name": "questDefinition",
      "discriminator": [
        106,
        90,
        250,
        119,
        170,
        124,
        111,
        19
      ]
    },
    {
      "name": "questProgress",
      "discriminator": [
        77,
        66,
        99,
        169,
        234,
        177,
        58,
        162
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
      "name": "invalidCollection",
      "msg": "Invalid collection"
    },
    {
      "code": 6002,
      "name": "invalidPrice",
      "msg": "Invalid price"
    },
    {
      "code": 6003,
      "name": "notOwner",
      "msg": "NFT not owned by seller"
    },
    {
      "code": 6004,
      "name": "listingAlreadyExists",
      "msg": "Listing already exists"
    },
    {
      "code": 6005,
      "name": "listingNotFound",
      "msg": "Listing not found"
    },
    {
      "code": 6006,
      "name": "cannotBuySelf",
      "msg": "Cannot buy your own listing"
    },
    {
      "code": 6007,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6008,
      "name": "invalidAsset",
      "msg": "Invalid Metaplex Core asset"
    },
    {
      "code": 6009,
      "name": "invalidMintAuthority",
      "msg": "Invalid mint authority"
    },
    {
      "code": 6010,
      "name": "questNotActive",
      "msg": "Quest not active"
    },
    {
      "code": 6011,
      "name": "questAlreadyCompleted",
      "msg": "Quest already completed"
    },
    {
      "code": 6012,
      "name": "questNotCompleted",
      "msg": "Quest not completed"
    },
    {
      "code": 6013,
      "name": "questRewardAlreadyClaimed",
      "msg": "Quest reward already claimed"
    },
    {
      "code": 6014,
      "name": "invalidQuestType",
      "msg": "Invalid quest type"
    },
    {
      "code": 6015,
      "name": "feeTooHigh",
      "msg": "Fee basis points exceed maximum"
    },
    {
      "code": 6016,
      "name": "skinCurrentlyEquipped",
      "msg": "Cannot list a skin that is currently equipped"
    },
    {
      "code": 6017,
      "name": "invalidGauntletPool",
      "msg": "Invalid gauntlet pool account"
    }
  ],
  "types": [
    {
      "name": "listing",
      "docs": [
        "NFT listing for sale",
        "PDA: [b\"listing\", asset.key()]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seller",
            "docs": [
              "Seller wallet"
            ],
            "type": "pubkey"
          },
          {
            "name": "asset",
            "docs": [
              "Metaplex Core asset address"
            ],
            "type": "pubkey"
          },
          {
            "name": "collection",
            "docs": [
              "Collection the asset belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "priceLamports",
            "docs": [
              "Sale price in lamports"
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "docs": [
              "When the listing was created"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketplaceConfig",
      "docs": [
        "Marketplace configuration (singleton)",
        "PDA: [b\"marketplace_config\"]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Admin authority"
            ],
            "type": "pubkey"
          },
          {
            "name": "skinsCollection",
            "docs": [
              "Skins collection address (Metaplex Core)"
            ],
            "type": "pubkey"
          },
          {
            "name": "itemsCollection",
            "docs": [
              "Items collection address (Metaplex Core)"
            ],
            "type": "pubkey"
          },
          {
            "name": "companyTreasury",
            "docs": [
              "Company treasury for fee collection"
            ],
            "type": "pubkey"
          },
          {
            "name": "gauntletPool",
            "docs": [
              "Gauntlet pool vault for fee collection"
            ],
            "type": "pubkey"
          },
          {
            "name": "companyFeeBps",
            "docs": [
              "Company fee in basis points (e.g., 300 = 3%)"
            ],
            "type": "u16"
          },
          {
            "name": "gauntletFeeBps",
            "docs": [
              "Gauntlet pool fee in basis points (e.g., 200 = 2%)"
            ],
            "type": "u16"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "objectiveType",
      "docs": [
        "Objective type for quests"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "winBattles"
          },
          {
            "name": "completeLevels"
          },
          {
            "name": "playPvpMatches"
          },
          {
            "name": "defeatBosses"
          },
          {
            "name": "collectGold"
          }
        ]
      }
    },
    {
      "name": "questDefinition",
      "docs": [
        "Quest template",
        "PDA: [b\"quest_def\", &quest_id.to_le_bytes()]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "questId",
            "docs": [
              "Unique quest identifier"
            ],
            "type": "u16"
          },
          {
            "name": "questType",
            "docs": [
              "Daily, Weekly, or Seasonal"
            ],
            "type": {
              "defined": {
                "name": "questType"
              }
            }
          },
          {
            "name": "objectiveType",
            "docs": [
              "What the player must do"
            ],
            "type": {
              "defined": {
                "name": "objectiveType"
              }
            }
          },
          {
            "name": "objectiveCount",
            "docs": [
              "How many times the objective must be completed"
            ],
            "type": "u16"
          },
          {
            "name": "rewardType",
            "docs": [
              "What reward is given"
            ],
            "type": {
              "defined": {
                "name": "rewardType"
              }
            }
          },
          {
            "name": "rewardData",
            "docs": [
              "Encoded reward parameters (skin_id, item_id, booster count, etc.)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "season",
            "docs": [
              "Season number (0 = permanent, 1+ = seasonal)"
            ],
            "type": "u8"
          },
          {
            "name": "active",
            "docs": [
              "Whether quest is currently active"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "questProgress",
      "docs": [
        "Player quest progress",
        "PDA: [b\"quest_progress\", player.key(), &quest_id.to_le_bytes()]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "docs": [
              "Player wallet"
            ],
            "type": "pubkey"
          },
          {
            "name": "questId",
            "docs": [
              "Quest ID reference"
            ],
            "type": "u16"
          },
          {
            "name": "progress",
            "docs": [
              "Current progress towards objective"
            ],
            "type": "u16"
          },
          {
            "name": "completed",
            "docs": [
              "Whether objective is completed"
            ],
            "type": "bool"
          },
          {
            "name": "claimed",
            "docs": [
              "Whether reward has been claimed"
            ],
            "type": "bool"
          },
          {
            "name": "lastReset",
            "docs": [
              "Last reset timestamp (for daily/weekly quests)"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "questType",
      "docs": [
        "Quest type (daily, weekly, seasonal)"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "daily"
          },
          {
            "name": "weekly"
          },
          {
            "name": "seasonal"
          }
        ]
      }
    },
    {
      "name": "rewardType",
      "docs": [
        "Reward type for quest completion"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "gauntletBooster"
          },
          {
            "name": "skin"
          },
          {
            "name": "nftItem"
          }
        ]
      }
    }
  ]
};
