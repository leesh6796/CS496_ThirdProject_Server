var mongo = require('mongodb').MongoClient;
var vsprintf = require('sprintf').vsprintf;

class Game {
        constructor(requester, allower) { // parameter는 phoneNumber로 받는다.
                this.requester = requester;
                this.allower = allower;
                this.board = new Array();
                this.turn = Date.now() % 2; // 누구 턴인지. 0이면 requester, 1이면 allower
                this.remainChangeTurn = 6; // 6개 돌 두면 (각 각 3개씩) 흑, 백이 바뀐다.

                if(this.turn == 0) { // requester가 선이면
                        this.black = requester;
                        this.white = allower;
                }
                else { // allower가 선이면
                        this.black = allower;
                        this.white = requester;
                }

                // 15 * 15 바둑판을 만들어둔다.
                var i;
                for(i=0; i<15*15; i++) {
                        this.board.push(0);
                }
        }

        getPoint(col, row) {
                return 15 * col + row;
        }

        setPoint(col, row, val) {
                this.board[getPoint(col, row)] = val;
        }

        swap(io, requesterId, allowerId) {
                var black = this.black;
                var white = this.white;

                // 흑, 백을 바꾸고
                this.black = white;
                this.white = black;

                // 플레이어들에게 알린다.
                io.to(requesterId).emit('swap', {black : this.black, white : this.white});
                io.to(allowerId).emit('swap', {black : this.black, white : this.white});
        }

        startTurn(io, requesterId, allowerId) {
                io.to(requesterId).emit('startTurn', {
                        remainChangeTurn : this.remainChangeTurn,
                        turn : this.turn,
                        black : this.black,
                        white : this.white
                });

                io.to(allowerId).emit('startTurn', {
                        remainChangeTurn : this.remainChangeTurn,
                        turn : this.turn,
                        black : this.black,
                        white : this.white
                });

                console.log("흑 : " + this.black);
                console.log("백 : " + this.white);
        }

        nextTurn(io, requesterId, allowerId) {
                // 아직 바뀔 때 까지 턴 수 남았으면 1 감소하고
                if(this.remainChangeTurn > 0) {
                        this.remainChangeTurn -= 1;

                        if(this.turn == 0) this.turn = 1;
                        else this.turn = 0;

                        // 0 되면 턴이 바뀐다.
                        if(this.remainChangeTurn == 0) {
                                this.remainChangeTurn = 6;
                                this.swap(io, requesterId, allowerId);
                        }

                        // 플레이어들에게 남은 턴 수와 누구 턴인지를 알린다.
                        io.to(requesterId).emit('nextTurn', {remainChangeTurn : this.remainChangeTurn, turn : this.turn, board : this.board});
                        io.to(allowerId).emit('nextTurn', {remainChangeTurn : this.remainChangeTurn, turn : this.turn, board : this.board});
                }
        }
}

module.exports = Game
