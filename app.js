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
var socketID = {};
var online = []; // 접속자 명단 관리
var game = []; // 진행중인 게임 관리
var User = require('./user');

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
                        io.to(socketID[to]).emit('reqGame', {name : from_name, phoneNumber : from_phoneNumber, tier : from_tier});
                }
        });
});

/*io.on('connection', function(socket) {
        console.log('a user connected');
        socket.on('disconnect', function() {
                console.log('user disconnected');
        });

        socket.on('chat message', function(msg) {
                console.log('message: ' + msg);
                io.emit('chat message', msg);
        });
});

http.listen(3000, function() {
        console.log('listening on *:3000');
});*/
