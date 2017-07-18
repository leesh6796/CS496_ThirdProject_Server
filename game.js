var mongo = require('mongodb').MongoClient;
var vsprintf = require('sprintf').vsprintf;

class Game {
        constructor(requester, allower, requesterId, allowerId) { // parameter는 phoneNumber로 받는다.
                this.req = requester;
                this.alo = allower;

                this.reqId = requesterId;
                this.aloId = allowerId;

                this.size = 19;

                this.board = [];
                this.turn = Date.now() % 2; // 누구 턴인지. 0이면 requester, 1이면 allower
                this.remainChangeTurn = 6; // 6개 돌 두면 (각 각 3개씩) 흑, 백이 바뀐다.

                if(this.turn == 0) { // requester가 선이면
                        this.black = this.req.phoneNumber;
                        this.white = this.alo.phoneNumber;
                }
                else { // allower가 선이면
                        this.black = this.alo.phoneNumber;
                        this.white = this.req.phoneNumber;
                }

                // 19 * 19 바둑판을 만들어둔다.
                var i;
                for(i=0; i<this.size; i++) {
                        this.board.push([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
                }
        }

        setBoard(newBoard) {
                this.board = newBoard;
        }

        getPoint(col, row) {
                return this.board[parseInt(col)][parseInt(row)];
        }

        setPoint(col, row, val) {
                this.board[parseInt(col)][parseInt(row)] = val;
        }

        printBoard() {
                var i, j;
                var line;
                for(i=0; i<this.size; i++) {
                        line = '';
                        for(j=0; j<this.size; j++) {
                                line += this.board[i][j] + " ";
                        }
                        console.log(line);
                }
        }

        swap(io) {
                var black = this.black;
                var white = this.white;

                // 흑, 백을 바꾸고
                this.black = white;
                this.white = black;

                // 플레이어들에게 알린다.
                io.to(this.reqId).emit('swap', {black : this.black, white : this.white});
                io.to(this.aloId).emit('swap', {black : this.black, white : this.white});

                console.log('Swap 진행')
                console.log('black : ' + this.black + ', white : ' + this.white);
        }

        // 게임이 시작하면 돌, 턴 정보와 상대 전적을 보낸다.
        startTurn(io) {
                io.to(this.reqId).emit('startTurn', {
                        remainChangeTurn : this.remainChangeTurn,
                        turn : this.turn,
                        black : this.black,
                        white : this.white,
                        enemyName : this.alo.name,
                        enemyPhoneNumber : this.alo.phoneNumber,
                        enemyInfo : {win : this.alo.num_win, lose : this.alo.num_lose, tier : this.alo.tier}
                });

                io.to(this.aloId).emit('startTurn', {
                        remainChangeTurn : this.remainChangeTurn,
                        turn : this.turn,
                        black : this.black,
                        white : this.white,
                        enemyName : this.req.name,
                        enemyPhoneNumber : this.req.phoneNumber,
                        enemyInfo : {win : this.req.num_win, lose : this.req.num_lose, tier : this.req.tier}
                });

                console.log("흑 : " + this.black);
                console.log("백 : " + this.white);
        }

        // 상대방이 수를 뒀을 때 (검증 된 단계)
        put(io, params) {
                var phoneNumber = params.phoneNumber;
                var col = params.col;
                var row = params.row;

                console.log("현재 그 자리는 : " + this.getPoint(col, row));
                if(this.getPoint(col, row) == 0) { // (col, row)가 빈 자리일 때만
                        var type = 1; // 기본은 흑돌
                        if(this.white === phoneNumber) type = 2; // white가 phoneNumber면

                        this.setPoint(col, row, type);
                        this.printBoard();

                        this.checkFinish(col, row, type, (result) => {
                                if(result) { // 게임 끝
                                        var isReqWin = this.turn == 0; // 이겼을 때 turn = 0이면 Req의 win

                                        this.endGame(io, isReqWin, phoneNumber, type); // phoneNumber와 백이 이겼는지, 흑이 이겼는지를 보낸다.
                                } else { // 안 끝
                                        this.nextTurn(io, col, row, type);
                                }
                        });
                }
        }

        endGame(io, isReqWin, phoneNumber, type) {
                var winner = this.req.phoneNumber;
                var loser = this.alo.phoneNumber;
                if(!isReqWin) {
                        winner = this.alo.phoneNumber;
                        loser = this.req.phoneNumber;
                }

                io.to(this.reqId).emit('endGame', {
                        winner : winner,
                        loser : loser
                });

                io.to(this.aloId).emit('endGame', {
                        winner : winner,
                        loser : loser
                });

                mongo.connect('mongodb://localhost:27017/bat', (error, db) => {
                        if (error) console.log(error);
                        else {
                                db.collection('account').update({phoneNumber: winner}, {$inc : {num_win : 1}});
                                db.collection('account').update({phoneNumber: loser}, {$inc : {num_lose : 1}});
                        }
                });

                return '';
        }

        checkFinish(col, row, type, cb) {
                var count = 0;
                var cc, cr; // cursor col, cursor row
                var isInner = (cc, cr) => {
                        return 0 <= cc && cc < this.size && 0 <= cr && cr < this.size;
                }

                col = parseInt(col);
                row = parseInt(row);

                // row만 감소시켜, type과 다를 때 까지 감소
                cc = col;
                cr = row;
                while(isInner(cc, cr - 1) && this.getPoint(cc, cr - 1) == type) {
                        cr -= 1;
                }

                // row를 증가시켜, type과 다를 때 까지 count 증가
                while(isInner(cc, cr) && this.getPoint(cc, cr) == type) {
                        count += 1;
                        cr += 1;
                }

                if(count == 5) return cb(true);

                // col만 감소시켜, type과 다를 때 까지 감소
                count = 0;
                cc = col;
                cr = row;
                while(isInner(cc - 1, cr) && this.getPoint(cc - 1, cr) == type) {
                        cc -= 1;
                }

                // col를 증가시켜, type과 다를 때 까지 count 증가
                while(isInner(cc, cr) && this.getPoint(cc, cr) == type) {
                        count += 1;
                        cc += 1;
                }

                if(count == 5) return cb(true);


                // 왼쪽 위부터 오른쪽 아래 대각선
                count = 0;
                cc = col;
                cr = row;
                while(isInner(cc - 1, cr - 1) && this.getPoint(cc - 1, cr - 1) == type) {
                        cc -= 1;
                        cr -= 1;
                }

                // 왼쪽 위부터 오른쪽 아래 대각선 센다.
                while(isInner(cc, cr) && this.getPoint(cc, cr) == type) {
                        count += 1;
                        cc += 1;
                        cr += 1;
                }

                if(count == 5) return cb(true);


                // 오른쪽 위부터 왼쪽 아래 대각선
                count = 0;
                cc = col;
                cr = row;
                while(isInner(cc + 1, cr + 1) && this.getPoint(cc + 1, cr + 1) == type) {
                        cc += 1;
                        cr += 1;
                }

                // 오른쪽 위부터 왼쪽 아래 대각선 센다.
                while(isInner(cc, cr) && this.getPoint(cc, cr) == type) {
                        count += 1;
                        cc -= 1;
                        cr -= 1;
                }

                if(count == 5) return cb(true);


                return cb(false);
        }

        // 직전 수의 좌표와 흑돌인지 백돌인지 보낸다.
        nextTurn(io, col, row, type) {
                // 아직 바뀔 때 까지 턴 수 남았으면 1 감소하고
                if(this.remainChangeTurn > 0) {
                        this.remainChangeTurn -= 1;

                        if(this.turn == 0) this.turn = 1;
                        else this.turn = 0;

                        // 플레이어들에게 남은 턴 수와 누구 턴인지를 알린다.
                        io.to(this.reqId).emit('nextTurn', {remainChangeTurn : this.remainChangeTurn, turn : this.turn, prev_col : col, prev_row : row, prev_type : type});
                        io.to(this.aloId).emit('nextTurn', {remainChangeTurn : this.remainChangeTurn, turn : this.turn, prev_col : col, prev_row : row, prev_type : type});

                        // 0 되면 턴이 바뀐다.
                        if(this.remainChangeTurn == 0) {
                                this.remainChangeTurn = 6;
                                this.swap(io);
                        }
                }
        }
}

module.exports = Game
