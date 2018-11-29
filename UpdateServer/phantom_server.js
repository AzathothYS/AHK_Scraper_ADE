
const webpage = require('webpage');
const page = webpage.create();

require("es6-promise").polyfill();

const fs = require("fs");

var t = Date.now();
var connectionAddress = "https://planning.univ-rennes1.fr/direct/myplanning.jsp";

phantom.onError = function(msg, trace) {
    console.log("PHANTOM ERROR: " + msg + "\n trace:" + trace);
    log("PHANTOM ERROR: " + msg.toString(), msg, "\n trace:" + trace.toString(), trace);
}

const LOG_FILE_PATH = "../log.txt"; // TODO : y faire gaffe
function log() {
    var d = new Date();
    var str = d.getFullYear()
         + "-" + ("0" + (d.getMonth() + 1)).slice(-2)
         + "-" + ("0" + d.getDate()).slice(-2)
         + " " + ("0" + d.getHours()).slice(-2)
         + ":" + ("0" + d.getMinutes()).slice(-2)
         + ":" + ("0" + d.getSeconds()).slice(-2);
    
    var msg, obj;
    for (var i = 0; i < arguments.length; i++) {
        msg = arguments[i];

        if (typeof msg === "string") {
            str += msg + " ";

        } else {
            obj = JSON.stringify(msg, null, 2);

            if (obj === "{}") {
                if ("toString" in msg)
                    str += msg.toString();
                else
                    str += (typeof msg) + " -> empty";

            } else {
                str += obj;
            }
        }
    }
    
    console.log(str);

    str = "\nPHANTOM: " + str;
    
    try {
        fs.write(LOG_FILE_PATH + "log.txt", str, "a");
    } catch (error) {
        console.log(error);
        phantom.exit()
    }
}

const credentials = JSON.parse(fs.readFileSync("./Keys/ur1-login-credentials.json", "utf8"));

var lastExchange = t;
var sessionID = undefined;
var timestamp = undefined;

page.viewportSize = {width: 1500, height: 1000};

page.onResourceRequested = function(request) {
    //log("Request: ", request.method, request.url);

    if (timestamp == undefined && request.method === "POST" && request.url === "https://planning.univ-rennes1.fr/direct/gwtdirectplanning/ConfigurationServiceProxy") {
        setTimestamp(request["postData"]);
    }

    lastExchange = Date.now();
}

page.onResourceReceived = function(response) {
    //log("Receive: ", response);
    lastExchange = Date.now();
};

page.onConsoleMessage = function(msg) {
    log("Webpage:", msg);
}

page.open(connectionAddress, function(status) {
    if (status !== "success") {
        log("Failed to load the address");
        phantom.exit();
    } else {
        loginSequence(); 
    }
});

function loginSequence() {
    Promise.resolve()
        .then(function() {
            return new Promise(function(resolve, reject) {
                var success = page.evaluate(function() {
                    document.form.username.value = credentials.username;
                    document.form.password.value = credentials.password;
                    return true;
                });
    
                if (success) {
                    resolve();
                } else {
                    reject("Unable to find the login form.");
                }
            });
        })
        .then(function() {
            return new Promise(function(resolve, reject) {
                setTimeout(resolve, 2000); // sleep for 2 sec, for ADE to preload
            });
        })
        .then(function() {
            return new Promise(function(resolve, reject) {
                var success = page.evaluate(function() {
                    //document.form.submit(); <- inutilisable, car un élément du form avec name="submit"...
                    document.querySelector("input[name=submit]").click()
                    console.log("Successfully submitted the login form.");
                    return true;
                });
    
                if (success) {
                    resolve();
                } else {
                    reject("Unable to sumbit login form.");
                }
            })
            .then(function() {
                log("Successfully logged in!");
                manageADE();
            });
        })
        .catch(function(reason) {
            log("Error when login:", reason.toString());

            sendMessageToLocalServer({error: "loginFail"});

            Promise.resolve()
                .then(function() {
                    return new Promise(function(resolve, reject) {
                        setTimeout(resolve, 2000); // sleep for 2 sec, for the message to be sent
                    });
                })
                .then(function() {
                    page.render(LOG_FILE_PATH + "loginFail.png");
                    phantom.exit();
                });
        });
}

function manageADE() {
    Promise.resolve()
        .then(waitForLoading)
        .then(function() {
            t = Date.now() - t;
            log("Loading time:", t, "ms");
            
            if (timestamp === undefined) {
                log("The timestamp hasn't been set!");
                reject("Timestamp isn't set.");
            }

            eatTheCookies();

            if (sessionID === undefined) {
                log("The session ID hasn't been found!");
                reject("SessionID isn't set.");
            }

            log("Successfully set timestamp and session ID.")

            sendMessageToLocalServer({timestamp: timestamp, sessionID: sessionID});
        })
        .catch(function(error) {
            log("Error - ", error.toString(), error);

            sendMessageToLocalServer({error: "adefail"});

            Promise.resolve()
                .then(function() {
                    return new Promise(function(resolve, reject) {
                        setTimeout(resolve, 2000); // sleep for 2 sec, for the message to be sent
                    });
                })
                .then(function() {
                    page.render(LOG_FILE_PATH + "adeFail.png");
                    phantom.exit();
                });
        })
        .then(function() {
            keepConnectionAlive();
        });
}

function waitForLoading() {
    log("Loading", connectionAddress);

    return new Promise(function(resolve, reject) {
        const timeout = setTimeout(function() {
            log("Page loading timed out!");
            reject();
        }, 20000);
    
        const interval = setInterval(function() {
            if (Date.now() - lastExchange > 1000) {
                clearInterval(interval);
                clearTimeout(timeout);
                log("Finished loading the page.");                
                resolve();
            }
        }, 100);
    });
}

function setTimestamp(requestBody) {
    if (!requestBody || typeof requestBody != "string") {
        log("Invalid/Empty body! Cannot set timestamp. (", requestBody, ")");
        return;
    }

    const value = requestBody.split("|")[17];

    if (!value.match(/^[0-9A-Za-z$_]{7,}$/)) {
        // ne respecte pas l'encodage base64 MIME, ou n'a pas suffisament de caractères pour être vraiment un timestamp
        log("Invalid timestamp ? :", value);    
    } else {
        log("Set timestamp to :", value);
        timestamp = value;
    }
}

function eatTheCookies() {
    log("Parsing cookies...");
    
    var cookie;
    for (var i = 0; i < page.cookies.length; i++) {
        cookie = page.cookies[i];

        if (cookie.name === "JSESSIONID") {
            sessionID = cookie.value;
            log("JSESSIONID:", sessionID);
            break;
        }
    }

    if (sessionID === undefined) {
        log("Couldn't find the JSESSIONID cookie!");
        log("Cookies: ", page.cookies);
    }
}

function sendMessageToLocalServer(data) {
    const toServer = webpage.create();
    toServer.open("http://localhost:3042/", "post", JSON.stringify(data), function(status) {
        if (status !== "success") {
            log("Unable to post to local server!", "\nPayload:", data);
        } else {
            log("Post ok.");
        }
    });
}

var connectionTimeout;
function keepConnectionAlive() {
    connectionTimeout = setTimeout(closeConnection, 30 * 1000);
    setupServer();
}

function setupServer() {
    var server = require("webserver").create();

    server.listen("127.0.0.1:4230", function(req, res) {
        log("Received: ", req);
        
        if (req.post === "refresh") {
            log("Refresh.");
            clearTimeout(connectionTimeout);
            connectionTimeout = setTimeout(closeConnection, 30 * 1000)

        } else if (req.post === "close") {
            log("This is end.");
            clearTimeout(connectionTimeout);
            closeConnection();
        }

        res.statusCode = 200;
        res.write("");
        res.close();
    });
}

function closeConnection() {
    log("Closing connection...");
    setTimeout(phantom.exit, 1000);
}
