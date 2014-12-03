var MyWalletPhone = {};
var pendingTransactions = {};

window.onerror = function(errorMsg, url, lineNumber) {
    device.execute("jsUncaughtException:url:lineNumber:", [errorMsg, url, lineNumber]);
}

$(document).ajaxStart(function() {
    // Disconnect WS when we send another request to the server - this was leading to crashes
    webSocketDisconnect();
    device.execute('ajaxStart');
}).ajaxStop(function() {
    device.execute('ajaxStop');
    // Re-connent WS again when the request is finished
    simpleWebSocketConnect();
});

console.log = function(message) {
    device.execute("log:", [message]);
}

min = false;
isExtension = true;
APP_NAME = 'javascript_iphone_app';
APP_VERSION = '0.1 BETA';
root = "https://blockchain.info/";
resource = '';

$(document).ready(function() {
    MyWallet.logout = function() {}
});

MyWallet.getWebWorkerLoadPrefix = function() {
    return '';
}


// Register for JS event handlers and forward to Obj-C handlers

MyWallet.addEventListener(function (event, obj) {
    var eventsWithObjCHandlers = ["did_decrypt", "did_fail_set_guid", "did_multiaddr", "did_set_latest_block", "error_restoring_wallet", "hd_wallets_does_not_exist", "hw_wallet_balance_updated", "logging_out", "on_add_private_key", "on_backup_wallet_error", "on_backup_wallet_success", "on_block", "on_error_adding_private_key", "on_error_creating_new_account", "on_error_pin_code_get_empty_response", "on_error_pin_code_get_error", "on_error_pin_code_get_invalid_response", "on_error_pin_code_get_timeout", "on_error_pin_code_put_error", "on_pin_code_get_response", "on_pin_code_put_response", "on_tx", "on_wallet_decrypt_finish", "on_wallet_decrypt_start", "ws_on_close ", "ws_on_open "];

    if (eventsWithObjCHandlers.indexOf(event) == -1)
         return;

    if (obj) {
        event += ':';
    }

    device.execute(event, [obj]);
});

MyWallet.monitor(function (obj) {
    console.log('Monitor event. Type: ' + (obj.type ? obj.type : 'null') +
                ' Code: ' + (obj.code ? obj.code : 'null') +
                ' Message: ' + (obj.message ? obj.message : 'null'))

    if (obj.type == 'loadingText') {
        device.execute('setLoadingText:', [obj.message])
    }

    else if (obj.type == 'error') {
        // TODO The server currently returns 500s if there are no free outputs - ignore it until server handles this differently
        if (obj.message == 'No free outputs to spend')
            return

        device.execute('makeNotice:id:message:', [''+obj.type, ''+obj.code, ''+obj.message])
    }

    else if (obj.type == 'success') {
        device.execute('makeNotice:id:message:', [''+obj.type, ''+obj.code, ''+obj.message])
    }
});


// My Wallet phone functions

MyWalletPhone.cancelTxSigning = function() {
    for (var key in pendingTransactions) {
        pendingTransactions[key].cancel();
    }
}

function setScryptImportExport() {
    ImportExport.Crypto_scrypt = function(passwd, salt, N, r, p, dkLen, callback) {
        device.execute('crypto_scrypt:salt:n:r:p:dkLen:', [passwd, salt, N, r, p, dkLen], function(buffer) {
            var bytes = CryptoJS.enc.hex.parse(buffer);
            callback(bytes);
        }, function(e) {
            error(''+e);
        });
    }
}

MyWalletPhone.fetchWalletJson = function(user_guid, shared_key, resend_code, inputedPassword, twoFACode, success, needs_two_factor_code, wrong_two_factor_code, other_error) {
    var success = function() {
        device.execute('did_decrypt')
    }
    var other_error = function() { }
    MyWallet.fetchWalletJson(user_guid, shared_key, resend_code, inputedPassword, twoFACode, success, needs_two_factor_code, wrong_two_factor_code, other_error)
}

MyWalletPhone.quickSendFromAddressToAddress = function(from, to, valueString) {
    return MyWalletPhone.quickSend(from, to, valueString);
}

MyWalletPhone.quickSendFromAddressToAccount = function(from, to, valueString) {
    var wallet = MyWallet.getHDWallet();
    var account = wallet.getAccount(to);
    
    var paymentRequest = MyWallet.generatePaymentRequestForAccount(to, valueString);
    var toAddress = account.getAddressForPaymentRequest(paymentRequest);
    
    return MyWalletPhone.quickSend(from, toAddress, valueString);
}

MyWalletPhone.quickSendFromAccountToAddress = function(from, to, valueString) {
    var id = ''+Math.round(Math.random()*100000);
        
    var success = function() {
        device.execute('tx_on_success:', [id]);
    }
    
    var error = function(error) {
        device.execute('tx_on_error:error:', [id, ''+error.message]);
    }
    
    var value = parseInt(valueString);
    
    if (!value || value == 0) {
        throw 'Invalid Send Value';
    }
    
    var fee = MyWallet.recommendedTransactionFeeForAccount(from, value);
    var note = null;
    
    MyWallet.sendBitcoinsForAccount(from, to, value, fee, note, success, error);
    
    return id;
}

MyWalletPhone.quickSendFromAccountToAccount = function(from, to, valueString) {
    var id = ''+Math.round(Math.random()*100000);
    
    var success = function() {
        device.execute('tx_on_success:', [id]);
    }
    
    var error = function(error) {
        device.execute('tx_on_error:error:', [id, ''+error.message]);
    }
    
    var value = parseInt(valueString);
    
    if (!value || value == 0) {
        throw 'Invalid Send Value';
    }
    
    var wallet = MyWallet.getHDWallet();
    var account = wallet.getAccount(to);
    
    var paymentRequest = MyWallet.generatePaymentRequestForAccount(to, valueString);
    var toAddress = account.getAddressForPaymentRequest(paymentRequest);
    
    var fee = MyWallet.recommendedTransactionFeeForAccount(from, value);
    var note = null;
    
    MyWallet.sendBitcoinsForAccount(from, toAddress, value, fee, note, success, error);
    
    return id;
}

MyWalletPhone.quickSend = function(from, to, valueString) {
    var id = ''+Math.round(Math.random()*100000);

    (function(id) {
        var listener = {
            on_success : function(e) {
                device.execute('tx_on_success:', [id]);
                delete pendingTransactions[id];
            },
            on_start : function() {
                device.execute('tx_on_start:', [id]);
            },
            on_error : function(e) {
                device.execute('tx_on_error:error:', [id, ''+e]);
                delete pendingTransactions[id];
            },
            on_begin_signing : function() {
                device.execute('tx_on_begin_signing:', [id]);
            },
            on_sign_progress : function(i) {
                device.execute('tx_on_sign_progress:input:', [id, i]);
            },
            on_finish_signing : function() {
                device.execute('tx_on_finish_signing:', [id]);
            }
        };

        MyWallet.getSecondPassword(function() {
            loadScript('signer', function() {
                try {
                    if (Object.keys(pendingTransactions).length > 0) {
                        throw 'Transaction already pending';
                    }

                    var obj = initNewTx();

                    obj.ask_for_private_key = function(success, error, address) {
                        device.execute('ask_for_private_key:', [address], function(privateKeyString) {
                            try {
                                var format = MyWallet.detectPrivateKeyFormat(privateKeyString);

                                if (format == 'bip38') {
                                    loadScript('import-export', function() {
                                        setScryptImportExport();

                                        MyWallet.getPassword($('#import-private-key-password'), function(_password) {
                                            ImportExport.parseBIP38toECKey(privateKeyString, _password, function(key, isCompPoint) {
                                                success(key);
                                            }, error);
                                        }, error);
                                    }, error);
                                } else {
                                    var key = MyWallet.privateKeyStringToKey(privateKeyString, format);

                                    if (key == null) {
                                        throw 'Could not decode private key';
                                    }

                                    success(key);
                                }
                            } catch(e) {
                                error(e);
                            }
                        }, error);
                    }

                    pendingTransactions[id] = obj;

                    if (from && from.length > 0) {
                        obj.from_addresses = [from];
                    } else {
                        obj.from_addresses = MyWallet.getLegacyActiveAddresses();
                    }

                    var value = Bitcoin.BigInteger.valueOf(valueString);

                    if (!value || value.compareTo(Bitcoin.BigInteger.ZERO) == 0) {
                        throw 'Invalid Send Value';
                    }

                    obj.to_addresses.push({address: Bitcoin.Address.fromBase58Check(to), value: value});

                    obj.addListener(listener);
                       
                    obj.start();
                } catch (e){
                    listener.on_error(e);
                }
            }, function(e) {
                listener.on_error(e);
            });
        }, function(e) {
            listener.on_error(e);
        });
    })(id);

    return id;
}

MyWalletPhone.apiGetPINValue = function(key, pin) {
    MyWallet.sendMonitorEvent({type: "loadingText", message: "Retrieving PIN Code", code: 0});

    $.ajax({
        type: "POST",
        url: root + 'pin-store',
        timeout: 30000,
        dataType: 'json',
        data: {
           format: 'json',
           method: 'get',
           pin : pin,
           key : key
       },
       success: function (responseObject) {
           device.execute('on_pin_code_get_response:', [responseObject])
       },
       error: function (res) {
           if (!res || !res.responseText || res.responseText.length == 0) {
                device.execute('on_error_pin_code_get_error:', ['Unknown Error']);
           } else {
                try {
                    var responseObject = $.parseJSON(res.responseText);
           
                    if (!responseObject) {
                        throw 'Response Object nil';
                    }
           
                    device.execute('on_pin_code_get_response:', [responseObject])
                } catch (e) {
                    device.execute('on_error_pin_code_get_error:', [res.responseText]);
                }
           }
       }
    });
}

MyWalletPhone.pinServerPutKeyOnPinServerServer = function(key, value, pin) {
    MyWallet.sendMonitorEvent({type: "loadingText", message: "Saving PIN Code", code: 0});
    
    $.ajax({
        type: "POST",
        url: root + 'pin-store',
        timeout: 30000,
        data: {
            format: 'plain',
            method: 'put',
            value : value,
            pin : pin,
            key : key
        },
        success: function (responseObject) {
           responseObject.key = key;
           responseObject.value = value;
           
           device.execute('on_pin_code_put_response:', [responseObject])
        },
        error: function (res) {
            if (!res || !res.responseText || res.responseText.length == 0) {
                device.execute('on_error_pin_code_put_error:', ['Unknown Error']);
           } else {
                try {
                    var responseObject = $.parseJSON(res.responseText);
           
                    responseObject.key = key;
                    responseObject.value = value;

                    device.execute('on_pin_code_put_response:', [responseObject])
                } catch (e) {
                    device.execute('on_error_pin_code_put_error:', [res.responseText]);
                }
           }
        }
    });
}

MyWalletPhone.newAccount = function(password, email) {
    loadScript('wallet-signup', function() {
               MyWalletSignup.generateNewWallet(password, email, function(guid, sharedKey, password) {
                                                MyStore.clear();
                                                device.execute('on_create_new_account:sharedKey:password:', [guid, sharedKey, password]);
                                                }, function (e) {
                                                device.execute('on_error_creating_new_account:', [''+e]);
                                                });
               });
}

MyWalletPhone.parsePairingCode = function (raw_code) {
    
    var success = function (pairing_code) {
        device.execute("didParsePairingCode:", [pairing_code]);
    }
    
    var error = function (e) {
        device.execute("errorParsingPairingCode:", [e]);
    }
    
    try {
        if (raw_code == null || raw_code.length == 0) {
            throw "Invalid Pairing QR Code";
        }
        
        if (raw_code[0] != '1') {
            throw "Invalid Pairing Version Code " + raw_code[0];
        }
        
        var components = raw_code.split("|");
        
        if (components.length < 3) {
            throw "Invalid Pairing QR Code. Not enough components.";
        }
        
        var guid = components[1];
        if (guid.length != 36) {
            throw "Invalid Pairing QR Code. GUID wrong length.";
        }
        
        var encrypted_data = components[2];
        
        MyWallet.sendMonitorEvent({type: "loadingText", message: "Decrypting Pairing Code", code: 0});
        
        $.ajax({
               type: "POST",
               url: root + 'wallet',
               timeout: 60000,
               data: {
               format: 'plain',
               method: 'pairing-encryption-password',
               guid: guid
               },
               success: function (encryption_phrase) {
               try {
               
               var decrypted = MyWallet.decrypt(encrypted_data, encryption_phrase, MyWallet.getDefaultPbkdf2Iterations(), function (decrypted) {
                                                return decrypted != null;
                                                }, function () {
                                                error('Decryption Error');
                                                });
               
               if (decrypted != null) {
               var components2 = decrypted.split("|");
               
               success({
                       version: raw_code[0],
                       guid: guid,
                       sharedKey: components2[0],
                       password: CryptoJS.enc.Hex.parse(components2[1]).toString(CryptoJS.enc.Utf8)
                       });
               } else {
               error('Decryption Error');
               }
               } catch(e) {
               error(''+e);
               }
               },
               error: function (res) {
               error('Pairing Code Server Error');
               }
               });
    } catch (e) {
        error(''+e);
    }
}

MyWalletPhone.addAddressBookEntry = function(bitcoinAddress, label) {
    MyWallet.addAddressBookEntry(bitcoinAddress, label);
    
    MyWallet.backupWallet();
}

MyWalletPhone.detectPrivateKeyFormat = function(privateKeyString) {
    try {
        return MyWallet.detectPrivateKeyFormat(privateKeyString);
    } catch(e) {
        return null;
    }
}

MyWalletPhone.hasEncryptedWalletData = function() {
    var data = MyWallet.getEncryptedWalletData();
    
    return data && data.length > 0;
}

MyWalletPhone.getWsReadyState = function() {
    if (!ws) return -1;

    return ws.readyState;
}

MyWalletPhone.get_wallet_and_history = function() {
    MyWallet.getWallet(function() {
        MyWallet.get_history()
    })
}

MyWalletPhone.getMultiAddrResponse = function() {
    var obj = {};

    obj.transactions = MyWallet.getTransactions();
    obj.total_received = MyWallet.getTotalReceived();
    obj.total_sent = MyWallet.getTotalSent();
    obj.final_balance = MyWallet.getFinalBalance();
    obj.n_transactions = MyWallet.getNTransactions();
    obj.addresses = MyWallet.getAllLegacyAddresses();

    obj.symbol_local = symbol_local;
    obj.symbol_btc = symbol_btc;

    return obj;
}

MyWalletPhone.addPrivateKey = function(privateKeyString) {
    (function(privateKeyString) {
        function error(e) {
            device.execute('on_error_adding_private_key:', [''+e]);
        }

        function reallyInsertKey(key, compressed) {
            try {
                if (MyWallet.addPrivateKey(key, {compressed : compressed, app_name : APP_NAME, app_version : APP_VERSION})) {

                    var addr = compressed ? key.getBitcoinAddressCompressed().toString() : key.getBitcoinAddress().toString();

                    device.execute('on_add_private_key:', [addr]);
     
                    MyWallet.backupWallet('update', function() {
                        MyWallet.get_history();
                    });
                } else {
                    throw 'Unable to add private key for bitcoin address ' + addr;
                }
            } catch (e) {
                error(e);
            }
        }

        MyWallet.getSecondPassword(function() {
            try {
                var format = MyWallet.detectPrivateKeyFormat(privateKeyString);

                if (format == 'bip38') {
                    loadScript('import-export', function() {
                        setScryptImportExport();

                        MyWallet.getPassword($('#import-private-key-password'), function(_password) {
                            ImportExport.parseBIP38toECKey(privateKeyString, _password, function(key, isCompPoint) {
                                //success
                                reallyInsertKey(key, isCompPoint);
                            }, error);
                        }, error);
                    }, error);
                } else {
                    var key = MyWallet.privateKeyStringToKey(privateKeyString, format);

                    reallyInsertKey(key, format == 'compsipa');
                }
            } catch (e) {
                error(e);
            }
        }, error);
    })(privateKeyString);
}


// Shared functions

function simpleWebSocketConnect() {
    console.log('Connecting websocket...');
    
    if (!window.WebSocket) {
        console.log('No websocket support in JS runtime');
        return;
    }
    
    if (!MyWallet.getIsInitialized()) {
        console.log('Wallet is not initialized yet');
        return;
    }
    
    if (ws && reconnectInterval) {
        console.log('Websocket already exists. Connection status: ' + ws.readyState);
        return;
    }
    
    // This should never really happen - try to recover gracefully
    if (ws) {
        console.log('Websocket already exists but no reconnectInverval. Connection status: ' + ws.readyState);
        webSocketDisconnect();
    }
    
    MyWallet.connectWebSocket();
}

function webSocketDisconnect() {
    console.log('Disconnecting websocket...');
    
    if (!window.WebSocket) {
        console.log('No websocket support in JS runtime');
        return;
    }
    
    if (!MyWallet.getIsInitialized()) {
        console.log('Wallet is not initialized yet');
        return;
    }
    
    if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
    }
    else {
        console.log('No reconnectInterval');
    }
    
    if (!ws) {
        console.log('No websocket object');
        return;
    }
    
    ws.close();
    
    ws = null;
}


// Overrides

MyWallet.getPassword = function(modal, success, error) {
    device.execute("getPassword:", [modal.selector], success, error);
}

MyWallet.makeNotice = function(type, _id, msg) {
    device.execute('makeNotice:id:message:', [''+type, ''+_id, ''+msg]);
}

MyStore.get_old = MyStore.get;
MyStore.get = function(key, callback) {
    // Disallow fetching of the guid
    if (key == 'guid') {
        callback();
        return;
    }
    
    MyStore.get_old(key, callback);
}

BlockchainAPI.get_history = function(success, error, tx_filter, offset, n) {
    MyWallet.sendMonitorEvent({type: "loadingText", message: "Loading transactions", code: 0});

    var clientTime=(new Date()).getTime();

    if (!tx_filter) tx_filter = 0;
    if (!offset) offset = 0;
    if (!n) n = 0;

    var data = {
        active : MyWallet.getLegacyActiveAddresses().join('|'),
        format : 'json',
        filter : tx_filter,
        offset : offset,
        no_compact : true,
        ct : clientTime,
        n : n,
        no_buttons : true,
        language : MyWallet.getLanguage(),
        guid : MyWallet.getGuid()
    };

    $.retryAjax({
        type: "POST",
        dataType: 'json',
        url: root +'multiaddr',
        data: data,
        timeout: 60000,
        retryLimit: 2,
        success: function(obj) {
            if (obj.error != null) {
                MyWallet.makeNotice('error', 'misc-error', obj.error);
            }

            MyWallet.handleNTPResponse(obj, clientTime);

            try {
                //Cache results to show next login
                if (offset == 0 && tx_filter == 0) {
                    MyStore.put('multiaddr', JSON.stringify(obj));
                }

                success(obj);
            } catch (e) {
                MyWallet.makeNotice('error', 'misc-error', e);

                error();
            }
        },
        error : function(data) {
            if (data.responseText)
                MyWallet.makeNotice('error', 'misc-error', data.responseText);
            else
                MyWallet.makeNotice('error', 'misc-error', 'Error Downloading Wallet Balance');

            error();
        }
    });
}