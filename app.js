var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var mongo = require('mongodb').MongoClient;
var vsprintf = require('sprintf').vsprintf;
var _ = require('underscore');

app.use(express.static(path.join(__dirname, "public")));

var port = process.env.PORT || 3000;
http.listen(port, () => {
        console.log("Server On");
});

app.get('/', function(req, res) {
        res.sendFile(__dirname + '/index.html');
});

var clients = {}; // User 객체 관리
var socketID = {}; // phoneNumber를 key로 socket.id 관리

var online = []; // 접속자 명단 관리
var onlineNames = {}; // phoneNumber를 key로 접속자 이름 관리.

var ready = []; // 시작 준비중인 게임 관리
var game = []; // 진행중인 게임 관리

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

                io.emit('onlineList', onlineNames);

                console.log("현재 접속 중");
                console.log(onlineNames);
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
                                                io.to(socket.id).emit('isRegistered', {result:'no'});
                                        }
                                        else {
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
                                onlineNames[phoneNumber] = name;
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
                        var msg = onlineNames[requester] + "가 게임 생성 도중 사라졌습니다.";
                        // requester가 online 목록에 없으면 새 게임을 시작하지 않는다.
                        io.to(socket.id).emit('alert', {msg:msg});
                        console.log(msg);
                }
        });

        // 플레이어가 수를 뒀을 때. 항상 requester를 key로 보내야한다.
        socket.on('putPoint', (params) => {
                var req = params.requester; // requester phoneNumber
                var isRequester = params.isRequester; // 수를 둔 사람이 requester인지

                // requester의 phoneNumber를 key로 game instance를 가져온다.
                var thisGame = game[req];

                if( (thisGame.turn == 0 && isRequester) || (thisGame.turn == 1 && !isRequester) ) { // requester턴이고, requester거나, requester 턴이 아니고, requester가 아니거나
                        thisGame.put(io, params);
                } else {
                        io.to(socket.id).emit('alert', {msg:'잘못된 턴 입니다.'});
                }
        });

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
