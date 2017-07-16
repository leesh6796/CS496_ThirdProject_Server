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

var ready = []; // 시작 준비중인 게임 관리
var game = []; // 진행중인 게임 관리

var User = require('./user');
var Game = require('./game');

io.on('connection', (socket) => {
        console.log("a user connected");
        clients[socket.id] = new User();

        // 연결 끊겼을 때
        socket.on('disconnect', () => {
                var phoneNumber = clients[socket.id].phoneNumber;
                console.log(vsprintf('%s가 연결 종료', [clients[socket.id].phoneNumber]));

                // underscore로 접속자 명단에서 해당 소켓 제거
                delete clients[socket.id];
                delete socketID[phoneNumber];
                online = _.without(online, phoneNumber);
                ready = _.without(ready, phoneNumber);

                io.emit('onlineList', online);

                console.log("현재 접속 중");
                console.log(online);
        });

        // phoneNumber 보내올 때
        socket.on('sendPhoneNumber', (params) => {
                var phoneNumber = params.phoneNumber;
                var name = params.name;

                if(!online.includes(phoneNumber)) {
                        clients[socket.id].connect(phoneNumber, name, () => {
                                online.push(phoneNumber);
                                socketID[phoneNumber] = socket.id;

                                io.emit('signin', {result:'complete'});
                                io.emit('onlineList', online);

                                console.log("현재 접속 중");
                                console.log(online);
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
                var from = clients[socket.io];
                var phoneNumber = from.phoneNumber;
                var to = params.to;

                // 게임 대기열에서 삭제
                ready = _.without(ready, phoneNumber);

                // to 한테 게임 중단 알림
                if(online.includes(to)) {
                        io.to(socketID[to]).emit('stopReqGame', {phoneNumber : phoneNumber});
                }
        });

        // 게임 요청을 수락했을 때
        socket.on('allowGame', (params) => {
                // allower는 게임을 수락한 사람이다.
                var allower = clients[socket.id];

                // requester는 게임을 요청한 사람이다.
                var requester = params.requester; // phoneNumber다.

                if(online.includes(requester)) {
                        // 게임 대기열에서 삭제
                        ready = _.without(ready, requester);

                        // 진행중인 게임 목록에 requester의 phoneNumber를 key로 하는 Game Instance 추가.
                        game[requester] = new Game(requester, allower.phoneNumber);

                        var msg = game[requester].requester + "와 " + game[requester].allower + "의 게임이 시작되었습니다.";

                        // requester와 allower에게 게임이 시작되었다는 메세지를 보낸다.
                        io.to(socket.id).emit('alert', {msg:msg}); // to allower
                        io.to(socketID[requester]).emit('alert', {msg:msg}); // to requester

                        console.log(msg);
                } else {
                        // requester가 online 목록에 없으면 새 게임을 시작하지 않는다.
                        console.log(requester + "가 게임 생성 도중 사라졌습니다.");
                }
        });
})
