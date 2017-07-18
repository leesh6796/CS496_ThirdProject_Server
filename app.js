var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var mongo = require('mongodb').MongoClient;
var vsprintf = require('sprintf').vsprintf;
var bodyParser = require('body-parser');
var session = require('express-session');
var _ = require('underscore');

app.use(express.static(path.join(__dirname, "public")));

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);

app.use('/js', express.static(__dirname + '/node_modules/sprintf/lib')); // redirect sprintf
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect jquery
app.use('/js', express.static(__dirname + '/node_modules/jcanvas/dist/min')); // redirect jcanvas

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));
app.use(session({
 secret: '@#$%^&*($)',
 resave: false,
 saveUninitialized: true
}));

var port = process.env.PORT || 3000;
http.listen(port, () => {
        console.log("Server On");
});

app.get('/', function(req, res) {
        res.render('index.html');
});

app.get('/dev', function(req, res) {
        res.render('dev.html');
});

var clients = {}; // User 객체 관리
var socketID = {}; // phoneNumber를 key로 socket.id 관리

var online = []; // 접속자 명단 관리
var onlineNames = {}; // phoneNumber를 key로 접속자 이름 관리.

var ready = []; // 시작 준비중인 게임 관리
var game = {}; // 진행중인 게임 관리

var User = require('./user');
var Game = require('./game');

io.on('connection', (socket) => {
        console.log("a user connected");
        clients[socket.id] = new User();

        // phoneNumber가 key인 onlineNames json array에서 value만 분리해준다.
        var getOnlineNames = () => {
                return _.map(onlineNames, (value, key) => {
                        return value;
                });
        }

        var sendOnlineList = () => {
                return onlineNames;
        };

        // 연결 끊겼을 때
        // 연결 끊겼을 때 진행중인 게임 없애는 기능 만들어야한다.
        socket.on('disconnect', () => {
                var phoneNumber = clients[socket.id].phoneNumber;
                console.log(vsprintf('%s가 연결 종료', [clients[socket.id].phoneNumber]));

                // underscore로 접속자 명단에서 해당 소켓 제거
                delete clients[socket.id];
                delete socketID[phoneNumber];
                delete onlineNames[phoneNumber];
                online = _.without(online, phoneNumber);
                ready = _.without(ready, phoneNumber);

                // 진행중인 게임 검색
                var target = _.find(game, (ele) => {
                        return ele.reqId === socket.id || ele.aloId === socket.id;
                });

                // 나간 플레이어가 진행중인 게임이 있을 경우
                if(target != undefined) {
                        var reqPhoneNumber = target.req.phoneNumber;
                        var aloPhoneNumber = target.alo.phoneNumber;
                        var reqId = target.reqId;
                        var aloId = target.aloId;
                        var reqName = target.req.name;
                        var aloName = target.alo.name;

                        if(online.includes(reqPhoneNumber)) {
                                console.log(reqName + "이 탈주");
                                io.to(reqId).emit('escapeGame', {});
                        }

                        if(online.includes(aloPhoneNumber)) {
                                console.log(aloName + "이 탈주");
                                io.to(aloId).emit('escapeGame', {});
                        }

                        targetPhoneNumber = target.req.phoneNumber;
                        delete game[targetPhoneNumber];
                }

                io.emit('onlineList', onlineNames);

                console.log("현재 접속 중");
                console.log(onlineNames);
        });

        // 클라이언트가 게임에서 나가면.
        socket.on('escapeGame', (params) => {
                var requester = params.requester;

                var target = game[requester];
                if(target != undefined) {
                        var reqId = target.reqId;
                        var aloId = target.aloId;

                        io.to(reqId).emit('escapeGame', {});
                        io.to(aloId).emit('escapeGame', {});

                        delete game[requester];

                        console.log(requester + '의 게임 터짐.');
                        console.log(game);
                }
        });

        // 가입 돼있는지 확인하는 API
        socket.on('isRegistered', (params) => {
                var phoneNumber = params.phoneNumber;

                mongo.connect('mongodb://localhost:27017/bat', (error, db) => {
                        if (error) console.log(error);
                        else {
                                db.collection('account').findOne({
                                        phoneNumber: phoneNumber
                                }, (err, ele) => {
                                        // ele가 null이면 가입 안돼있다.
                                        if (ele == null) {
                                                console.log(phoneNumber + "는 가입돼있지 않다.");
                                                io.to(socket.id).emit('isRegistered', {result:'no'});
                                        }
                                        else {
                                                console.log(phoneNumber + "는 가입돼있다.");
                                                io.to(socket.id).emit('isRegistered', {result:'yes'});
                                        }
                                        db.close();
                                });
                        }
                });
        });

        // phoneNumber 보내올 때
        socket.on('sendPhoneNumber', (params) => {
                var phoneNumber = params.phoneNumber;
                var name = params.name;

                if(!online.includes(phoneNumber)) {
                        clients[socket.id].connect(phoneNumber, name, () => {
                                online.push(phoneNumber);
                                target = clients[socket.id];
                                onlineNames[phoneNumber] = {};
                                onlineNames[phoneNumber].name = name;
                                onlineNames[phoneNumber].win = target.num_win;
                                onlineNames[phoneNumber].lose = target.num_lose;
                                onlineNames[phoneNumber].tier = target.tier;
                                onlineNames[phoneNumber].icon = target.icon;
                                socketID[phoneNumber] = socket.id;

                                io.to(socket.id).emit('signin', {result:'Sign In complete'});
                                io.emit('onlineList', onlineNames);

                                console.log("현재 접속 중");
                                console.log(onlineNames);
                        });
                }
        });

        // 게임 하자고 요청할 때
        socket.on('reqGame', (params) => {
                var from = clients[socket.id];
                var from_name = from.name;
                var from_phoneNumber = from.phoneNumber;
                var from_tier = from.tier;

                var to = params.to;

                // 접속자 명단에 to가 있으면
                if(online.includes(to)) {
                        console.log("새 게임 요청");

                        // 게임 대기열에 from_phoneNumber 저장
                        // 상대방이 게임 수락했을 때 대기열에 있어야만 시작된다.
                        ready.push(from_phoneNumber);

                        // to 한테 게임 하자고 요청
                        io.to(socketID[to]).emit('reqGame', {name : from_name, phoneNumber : from_phoneNumber, tier : from_tier});
                } else {
                        console.log("오프라인 상대에게 게임 요청");

                        // 온라인 아니면 오프라인이라고 알려준다.
                        io.to(socket.id).emit('alert', {msg : "상대방이 오프라인 입니다."});
                }
        });

        // 게임하자고 요청하고 취소했을 때
        socket.on('stopReqGame', (params) => {
                var from = clients[socket.id];
                var phoneNumber = from.phoneNumber;
                var name = from.name;
                var to = params.to;

                // 게임 대기열에서 삭제
                ready = _.without(ready, phoneNumber);

                // to 한테 게임 중단 알림
                if(online.includes(to)) {
                        io.to(socketID[to]).emit('stopReqGame', {phoneNumber : phoneNumber, name : name});

                        console.log(name + "이 " + to + "에게 게임 요청 중단.");
                }
        });

        // 게임 요청을 수락했을 때
        socket.on('allowGame', (params) => {
                // allower는 게임을 수락한 사람이다.
                var allower = clients[socket.id];

                // requester는 게임을 요청한 사람이다.
                var requester = params.requester; // phoneNumber다.

                if(online.includes(requester) && ready.includes(requester)) {
                        // 게임 대기열에서 삭제
                        ready = _.without(ready, requester);

                        // 진행중인 게임 목록에 requester의 phoneNumber를 key로 하는 Game Instance 추가.
                        // 각 플레이어의 User Instance와 socket.id를 parameter로 보낸다.
                        game[requester] = new Game(clients[socketID[requester]], allower, socketID[requester], socket.id);
                        var thisGame = game[requester];

                        // requester와 allower에게 게임이 시작되었다는 메세지를 보낸다.
                        var msg = thisGame.req.name + "와 " + thisGame.alo.name + "의 게임이 시작되었습니다.";
                        io.to(socket.id).emit('alert', {msg:msg}); // to allower
                        io.to(socketID[requester]).emit('alert', {msg:msg}); // to requester

                        console.log(msg);

                        // 첫 번째 턴을 시작한다.
                        thisGame.startTurn(io);
                } else {
                        var msg = onlineNames[requester].name + "가 게임 생성 도중 사라졌습니다.";
                        // requester가 online 목록에 없으면 새 게임을 시작하지 않는다.
                        io.to(socket.id).emit('alert', {msg:msg});
                        console.log(msg);
                }
        });

        // 플레이어가 수를 뒀을 때. 항상 requester를 key로 보내야한다.
        socket.on('putPoint', (params) => {
                var req = params.requester; // requester phoneNumber
                var isRequester;

                if(typeof params.isRequester === 'string')
                        isRequester = (params.isRequester === 'true'); // 수를 둔 사람이 requester인지
                else if(typeof params.isRequester === 'boolean')
                        isRequester = params.isRequester; // 수를 둔 사람이 requester인지

                console.log(params.isRequester + " " + typeof params.isRequester);

                // requester의 phoneNumber를 key로 game instance를 가져온다.
                console.log(req);
                console.log(game);
                var thisGame = game[req];

                console.log(isRequester + " " + typeof isRequester);
                if( (thisGame.turn == 0 && isRequester) || (thisGame.turn == 1 && !isRequester) ) { // requester턴이고, requester거나, requester 턴이 아니고, requester가 아니거나
                        thisGame.put(io, params);
                } else {
                        io.to(socket.id).emit('alert', {msg:'잘못된 턴 입니다.'});
                }
        });

        // endGame을 받으면 확인차 okEndGame을 서버에 보낸다.
        socket.on('okEndGame', (params) => {
                if(clients[socket.id] != undefined) {
                        clients[socket.id].refresh(() => {
                                let user = clients[socket.id];
                                let phoneNumber = user.phoneNumber;
                                onlineNames[phoneNumber].win = user.num_win;
                                onlineNames[phoneNumber].lose = user.num_lose;
                                io.to(socket.id).emit('onlineList', onlineNames);
                        })
                }
        })

        socket.on('testBoard', (params) => {
                var req = params.requester;
                var board = params.board;
                var thisGame = game[req];
                thisGame.setBoard(board);
                thisGame.checkFinish(8,7,1,(result) => {
                        console.log(result);
                });
        })
});
