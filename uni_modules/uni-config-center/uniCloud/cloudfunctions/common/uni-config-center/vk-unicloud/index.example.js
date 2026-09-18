module.exports = {
  "uni": {
    "passwordSecret": "YOUR_PASSWORD_SECRET",
    "tokenSecret": "YOUR_TOKEN_SECRET",
    "tokenExpiresIn": 604800,
    "tokenExpiresThreshold": 259200,
    "tokenMaxLimit": 10,
    "passwordErrorLimit": 6,
    "bindTokenToDevice": false,
    "passwordErrorRetryTime": 3600,
    "autoSetInviteCode": true,
    "forceInviteCode": false,
    "preferedAppPlatform": "app-plus",
    "preferedWebPlatform": "h5",
    "removeDcloudAppid": false,
    "app-plus": {
      "tokenExpiresIn": 604800,
      "tokenExpiresThreshold": 259200,
      "oauth": {
        "weixin": {
          "appid": "YOUR_APP_ID",
          "appsecret": "YOUR_APP_SECRET"
        },
        "huawei": {
          "clientId": "YOUR_CLIENT_ID",
          "clientSecret": "YOUR_CLIENT_SECRET"
        },
        "apple": {
          "bundleId": ""
        }
      }
    },
    "mp-weixin": {
      "oauth": {
        "weixin": {
          "appid": "YOUR_APP_ID",
          "appsecret": "YOUR_APP_SECRET"
        }
      }
    },
    "h5-weixin": {
      "oauth": {
        "weixin": {
          "appid": "YOUR_APP_ID",
          "appsecret": "YOUR_APP_SECRET"
        }
      }
    },
    "mp-alipay": {
      "oauth": {
        "alipay": {
          "appid": "YOUR_APP_ID",
          "privateKey": "YOUR_PRIVATE_KEY"
        }
      }
    },
    "mp-qq": {
      "oauth": {
        "qq": {
          "appid": "YOUR_APP_ID",
          "appsecret": "YOUR_APP_SECRET"
        }
      }
    },
    "mp-toutiao": {
      "oauth": {
        "toutiao": {
          "appid": "YOUR_APP_ID",
          "appsecret": "YOUR_APP_SECRET"
        }
      }
    },
    "mp-harmony": {
      "oauth": {
        "huawei": {
          "clientId": "YOUR_CLIENT_ID",
          "clientSecret": "YOUR_CLIENT_SECRET"
        }
      }
    },
    "service": {
      "sms": {
        "name": "重要",
        "codeExpiresIn": 180,
        "templateId": ""
      },
      "univerify": {
        "appid": "YOUR_APP_ID"
      }
    }
  },
  "uni-pay": {
    "notifyUrl": {
      "mp-33d35e24-c2f3-47b4-80fc-7b23a6666666": "https://fc-mp-33d35e24-c2f3-47b4-80fc-7b23a6666666.next.bspapp.com/http/vk-pay",
      "mp-5761d885-11b8-21b2-9122-22afea666666": "https://fc-mp-5761d885-11b8-21b2-9122-22afea666666.next.bspapp.com/http/vk-pay"
    },
    "notifyKey": "YOUR_NOTIFY_KEY",
    "autoDeleteExpiredOrders": 0,
    "alipayAppPayToH5Pay": false,
    "wxpay": {
      "mp-weixin": {
        "appId": "YOUR_APP_ID",
        "secret": "YOUR_SECRET",
        "mchId": "YOUR_MCH_ID",
        "key": "YOUR_KEY",
        "pfx": "YOUR_CERTIFICATE_BUFFER",
        "v3Key": "YOUR_WXPAY_V3_KEY",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "appPrivateKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyId": "YOUR_WXPAY_PUBLIC_KEY_ID",
        "version": 3
      },
      "app-plus": {
        "appId": "YOUR_APP_ID",
        "secret": "YOUR_SECRET",
        "mchId": "YOUR_MCH_ID",
        "key": "YOUR_KEY",
        "pfx": "YOUR_CERTIFICATE_BUFFER",
        "v3Key": "YOUR_WXPAY_V3_KEY",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "appPrivateKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyId": "YOUR_WXPAY_PUBLIC_KEY_ID",
        "version": 3
      },
      "h5": {
        "appId": "YOUR_APP_ID",
        "secret": "YOUR_SECRET",
        "mchId": "YOUR_MCH_ID",
        "key": "YOUR_KEY",
        "pfx": "YOUR_CERTIFICATE_BUFFER",
        "v3Key": "YOUR_WXPAY_V3_KEY",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "appPrivateKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyId": "YOUR_WXPAY_PUBLIC_KEY_ID",
        "version": 3
      },
      "h5-weixin": {
        "appId": "YOUR_APP_ID",
        "secret": "YOUR_SECRET",
        "mchId": "YOUR_MCH_ID",
        "key": "YOUR_KEY",
        "pfx": "YOUR_CERTIFICATE_BUFFER",
        "v3Key": "YOUR_WXPAY_V3_KEY",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "appPrivateKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyId": "YOUR_WXPAY_PUBLIC_KEY_ID",
        "version": 3
      },
      "mweb": {
        "appId": "YOUR_APP_ID",
        "secret": "YOUR_SECRET",
        "mchId": "YOUR_MCH_ID",
        "key": "YOUR_KEY",
        "pfx": "YOUR_CERTIFICATE_BUFFER",
        "v3Key": "YOUR_WXPAY_V3_KEY",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "appPrivateKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyId": "YOUR_WXPAY_PUBLIC_KEY_ID",
        "sceneInfo": {
          "h5_info": {
            "type": "Wap",
            "wap_url": "https://www.xxxxxx.com",
            "wap_name": "网站名称"
          }
        },
        "version": 3
      },
      "transfer": {
        "appId": "YOUR_APP_ID",
        "mchId": "YOUR_MCH_ID",
        "v3Key": "YOUR_WXPAY_V3_KEY",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "appPrivateKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyId": "YOUR_WXPAY_PUBLIC_KEY_ID",
        "version": 3
      },
      "codepay": {
        "appId": "YOUR_APP_ID",
        "mchId": "YOUR_MCH_ID",
        "key": "YOUR_KEY",
        "pfx": "YOUR_CERTIFICATE_BUFFER",
        "v3Key": "YOUR_WXPAY_V3_KEY",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "appPrivateKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyPath": "YOUR_CERTIFICATE_PATH",
        "wxpayPublicKeyId": "YOUR_WXPAY_PUBLIC_KEY_ID",
        "version": 3
      }
    },
    "alipay": {
      "mp-alipay": {
        "appId": "YOUR_APP_ID",
        "privateKey": "YOUR_PRIVATE_KEY",
        "alipayPublicKey": "YOUR_ALIPAY_PUBLIC_KEY",
        "sandbox": false
      },
      "app-plus": {
        "appId": "YOUR_APP_ID",
        "privateKey": "YOUR_PRIVATE_KEY",
        "alipayPublicCertPath": "YOUR_CERTIFICATE_PATH",
        "alipayRootCertPath": "YOUR_CERTIFICATE_PATH",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "sandbox": false
      },
      "h5": {
        "appId": "YOUR_APP_ID",
        "privateKey": "YOUR_PRIVATE_KEY",
        "alipayPublicCertPath": "YOUR_CERTIFICATE_PATH",
        "alipayRootCertPath": "YOUR_CERTIFICATE_PATH",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "sandbox": false
      },
      "transfer": {
        "appId": "YOUR_APP_ID",
        "privateKey": "YOUR_PRIVATE_KEY",
        "alipayPublicCertPath": "YOUR_CERTIFICATE_PATH",
        "alipayRootCertPath": "YOUR_CERTIFICATE_PATH",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "sandbox": false
      },
      "codepay": {
        "appId": "YOUR_APP_ID",
        "privateKey": "YOUR_PRIVATE_KEY",
        "alipayPublicCertPath": "YOUR_CERTIFICATE_PATH",
        "alipayRootCertPath": "YOUR_CERTIFICATE_PATH",
        "appCertPath": "YOUR_CERTIFICATE_PATH",
        "sandbox": false
      }
    },
    "appleiap": {
      "app-plus": {
        "password": "YOUR_PASSWORD",
        "timeout": 10000,
        "receiptExpiresIn": 86400,
        "sandbox": true
      }
    },
    "wxpay-virtual": {
      "mp-weixin": {
        "appId": "YOUR_APP_ID",
        "secret": "YOUR_SECRET",
        "mchId": "YOUR_MCH_ID",
        "offerId": "YOUR_OFFER_ID",
        "appKey": "YOUR_APP_KEY",
        "sandboxAppKey": "YOUR_SANDBOX_APP_KEY",
        "rate": 100,
        "token": "YOUR_TOKEN",
        "encodingAESKey": "YOUR_ENCODING_AES_KEY",
        "sandbox": false
      }
    },
    "vkspay": {
      "mchId": "YOUR_MCH_ID",
      "key": "YOUR_KEY"
    },
    "douyin": {
      "mp-toutiao": {
        "appId": "YOUR_APP_ID",
        "secret": "YOUR_SECRET",
        "mchId": "YOUR_MCH_ID",
        "salt": "YOUR_SALT",
        "token": "YOUR_TOKEN",
        "sandbox": false
      }
    },
    "huawei": {
      "mp-harmony": {
        "appId": "YOUR_APP_ID",
        "mchId": "YOUR_MCH_ID",
        "mchAuthId": "YOUR_MCH_AUTH_ID",
        "mchPrivateKey": "YOUR_MCH_PRIVATE_KEY",
        "platformPublicKey": "YOUR_PLATFORM_PUBLIC_KEY",
        "clientType": "mp-harmony"
      },
      "app-harmony": {
        "appId": "YOUR_APP_ID",
        "mchId": "YOUR_MCH_ID",
        "mchAuthId": "YOUR_MCH_AUTH_ID",
        "mchPrivateKey": "YOUR_MCH_PRIVATE_KEY",
        "platformPublicKey": "YOUR_PLATFORM_PUBLIC_KEY",
        "clientType": "app-harmony"
      }
    }
  },
  "vk": {
    "system": {
      "serviceShutdown": false,
      "serviceShutdownDescription": "系统维护中，预计2小时恢复!",
      "targetTimezone": 8
    },
    "crypto": {
      "aes": "YOUR_AES_KEY"
    },
    "clientCrypto": {
      "expTime": 60
    },
    "context": {
      "APPID": "",
      "PLATFORM": "h5",
      "LOCALE": "zh-Hans",
      "CLIENTIP": "127.0.0.1"
    },
    "service": {
      "email": {
        "163": {
          "host": "smtp.163.com",
          "port": 465,
          "secure": true,
          "auth": {
            "user": "",
            "pass": ""
          }
        },
        "codeExpiresIn": 180,
        "qq": {
          "host": "smtp.qq.com",
          "port": 465,
          "secure": true,
          "auth": {
            "user": "你的邮箱@qq.com",
            "pass": "邮箱授权码"
          }
        }
      },
      "log": {
        "login": {
          "status": true
        }
      },
      "sms": {
        "aliyun": {
          "enable": false,
          "accessKeyId": "YOUR_ACCESS_KEY_ID",
          "accessKeySecret": "YOUR_ACCESS_KEY_SECRET",
          "signName": "",
          "templateCode": {
            "verifyCode": ""
          }
        }
      },
      "openapi": {
        "baidu": {
          "appid": "YOUR_APP_ID",
          "appsecret": "YOUR_APP_SECRET"
        }
      },
      "cloudStorage": {
        "defaultProvider": "unicloud",
        "unicloud": {},
        "extStorage": {
          "provider": "qiniu",
          "domain": "YOUR_DOMAIN",
          "bucketName": "",
          "bucketSecret": "",
          "endpoint": {
            "upload": ""
          }
        }
      }
    },
    "db": {
      "unicloud": {
        "maxLimit": 1000,
        "cancelAddTime": false,
        "cancelAddTimeStr": false,
        "getTableData": {
          "sortArr": [
            {
              "name": "_add_time",
              "type": "desc"
            }
          ]
        }
      }
    },
    "cacheManage": {
      "mode": "db"
    },
    "oauth": {
      "weixin": {
        "list": [
          {
            "appid": "YOUR_APP_ID",
            "appsecret": "YOUR_APP_SECRET"
          },
          {
            "appid": "YOUR_APP_ID",
            "appsecret": "YOUR_APP_SECRET"
          }
        ]
      },
      "alipay": {
        "list": [
          {
            "appid": "YOUR_APP_ID",
            "privateKey": "YOUR_PRIVATE_KEY"
          },
          {
            "appid": "YOUR_APP_ID",
            "privateKey": "YOUR_PRIVATE_KEY"
          }
        ]
      },
      "qq": {
        "list": [
          {
            "appid": "YOUR_APP_ID",
            "appsecret": "YOUR_APP_SECRET"
          },
          {
            "appid": "YOUR_APP_ID",
            "appsecret": "YOUR_APP_SECRET"
          }
        ]
      },
      "toutiao": {
        "list": [
          {
            "appid": "YOUR_APP_ID",
            "appsecret": "YOUR_APP_SECRET"
          },
          {
            "appid": "YOUR_APP_ID",
            "appsecret": "YOUR_APP_SECRET"
          }
        ]
      }
    }
  }
};
