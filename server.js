// server.js
const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 添加reset路由，用于关闭服务器
app.get('/reset', (req, res) => {
    console.log('Reset request received, shutting down server...');
    res.send('Server is shutting down...');
    
    // 关闭服务器
    setTimeout(() => {
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    }, 1000);
});

// 身份配置
const identityConfig = {
    normal: {
        '7': ['乘客', '乘客', '屁者', '乘客', '乘客', '屁者', '乘客'],
        '8': ['屁者', '乘客', '乘客', '乘客', '响屁者', '乘客', '乘客', '乘客'],
        '9': ['乘客', '乘客', '屁者', '乘客', '乘客', '屁者', '乘客', '乘客', '屁者'],
        '10': ['屁者', '乘客', '乘客', '响屁者', '乘客', '乘客', '屁者', '乘客', '乘客', '乘客']
    },
    underworld: {
        '8': ['神父', '乘客', '小丑', '乘客', '乘客', '响屁者', '乘客', '探员'],
        '9': ['乘客', '屁者', '乘客', '探员', '乘客', '小丑', '乘客', '神父', '屁者'],
        '10': ['屁者', '乘客', '探员', '乘客', '神父', '乘客', '响屁者', '乘客', '小丑', '乘客']
    }
};

// 卡牌配置
const cards = {
    envCards: [
        { id: 1, name: '无屁', type: 'noFart', count: 4 },
        { id: 2, name: '有屁', type: 'smallFart', count: 2 },
        { id: 3, name: '有臭屁', type: 'bigFart', count: 1 },
        { id: 4, name: '有闷屁', type: 'bigFart', count: 1 },
        { id: 5, name: '有蔫儿屁', type: 'bigFart', count: 1 },
        { id: 6, name: '有彩虹屁', type: 'bigFart', count: 1 },
        { id: 7, name: '有连环屁', type: 'bigFart', count: 1 }
    ],
    actionCards: [
        { id: 1, name: '吸', type: 'draw', count: 24 },
        { id: 2, name: '骂', type: 'scold', count: 22 },
        { id: 3, name: '忍', type: 'defend', count: 16 },
        { id: 4, name: '抓', type: 'attack', count: 6 },
        { id: 5, name: '吹', type: 'blow', count: 8 },
        { id: 6, name: '听', type: 'listen', count: 4 }
    ]
};

// 游戏状态
let gameState = {
    room: null,
    players: [],
    envCards: [],
    actionDeck: [],
    gameStarted: false,
    currentRound: 1,
    exposedPlayers: [], // 存储被曝光玩家的UUID
    revealedPlayers: [], // 存储已翻开的玩家
    announcedSkills: [] // 存储已公示的技能
};

// 添加cheat路由，用于显示所有玩家的昵称和身份
app.get('/cheat', (req, res) => {
    // 从游戏状态中获取所有玩家信息
    const players = gameState.players.filter(p => p.role === 'player');
    
    // 构建玩家信息列表
    let playerList = '<h1>玩家信息</h1>';
    playerList += '<ul>';
    
    players.forEach(player => {
        playerList += `<li>昵称: ${player.name} - 身份: ${player.identity}</li>`;
    });
    
    playerList += '</ul>';
    
    // 返回HTML响应
    res.send(playerList);
});

// 添加cards路由，用于返回剩余牌组元素
app.get('/cards', (req, res) => {
    // 从游戏状态中获取剩余牌组
    const remainingCards = gameState.actionDeck;
    
    // 构建牌组元素字符串，每十个元素换一行，用全角逗号分隔
    let cardsString = '';
    let cardCount = 0;
    
    remainingCards.forEach((card, index) => {
        cardsString += card.name;
        
        // 不是最后一个元素时添加全角逗号
        if (index < remainingCards.length - 1) {
            cardsString += '，';
        }
        
        cardCount++;
        
        // 每十个元素换一行，使用<br>标签实现换行
        if (cardCount % 10 === 0 && index < remainingCards.length - 1) {
            cardsString += '<br>';
        }
    });
    
    // 如果没有剩余牌组，返回提示信息
    if (remainingCards.length === 0) {
        cardsString = '牌组已耗尽';
    }
    
    // 返回HTML响应，确保换行被正确渲染
    res.send(cardsString);
});

// 最后联系的玩家
let lastMessenger = null;

// 存储最后一个请求者的socket ID
// let lastRequester = null;

// 替换 lastRequester 为FIFO队列，以管理所有请求
let requestQueue = [];

io.on('connection', (socket) => {
    console.log('New client connected');

    // 发送房间状态给新连接的用户
    if (gameState.room) {
        socket.emit('roomExists', {
            roomId: gameState.room.id,
            players: gameState.players
        });
    }

    // 创建房间
    socket.on('createRoom', (data) => {
        if (gameState.room) {
            socket.emit('roomAlreadyExists');
            return;
        }

        // 重置游戏状态
        gameState = {
            room: null,
            players: [],
            envCards: [],
            actionDeck: [],
            gameStarted: false,
            currentRound: 1,
            exposedPlayers: [], // 重置曝光列表
            revealedPlayers: [], // 重置已翻开玩家列表
            announcedSkills: [] // 重置已公示技能列表
        };

        // 创建新房间
        gameState.room = {
            id: uuidv4().slice(2, 7),
            mode: data.mode,
            playerCount: data.playerCount,
            god: socket.id
        };

        // 添加主持人
        const godUUID = uuidv4().slice(2, 7);
        const godPlayer = {
            id: socket.id,
            uuid: godUUID,
            name: '上帝',
            role: 'god',
            playerId: 0,
            ready: true,
            hp: 100,
            identity: '主持人',
            handCards: [],
            actions: {}
        };

        gameState.players.push(godPlayer);

        // 通知所有客户端房间已创建
        io.emit('roomCreated', {
            roomId: gameState.room.id,
            playerCount: data.playerCount,
            players: gameState.players
        });

        // 给主持人发送房间信息
        socket.emit('setRoomInfo', {
            roomId: gameState.room.id,
            uuid: godUUID
        });

        console.log(`Room created: ${gameState.room.id}`);
    });

    // 加入房间
    socket.on('joinRoom', (data) => {
        if (!gameState.room) {
            socket.emit('noRoomAvailable');
            return;
        }

        // 检查房间是否已满
        const playerCount = gameState.players.filter(p => p.role === 'player').length;
        if (playerCount >= gameState.room.playerCount) {
            socket.emit('roomFull');
            return;
        }

        // 验证玩家名称
        if (!data.playerName || data.playerName.trim() === '') {
            socket.emit('invalidName');
            return;
        }

        // 创建新玩家
        const playerId = playerCount + 1;
        const playerUUID = uuidv4().slice(2, 7);

        const newPlayer = {
            id: socket.id,
            uuid: playerUUID,
            name: data.playerName,
            role: 'player',
            playerId: playerId,
            ready: false,
            hp: 4, // 初始血量为4
            handCards: [],
            identity: '',
            characterOptions: [], // 角色选项
            selectedCharacter: null, // 选择的角色
            actions: {},
            connected: true // 连接状态标记
        };

        gameState.players.push(newPlayer);

        // 通知所有客户端有新玩家加入
        io.emit('playerJoined', {
            players: gameState.players
        });

        // 给新玩家发送信息
        socket.emit('setPlayerInfo', {
            playerId: playerId,
            uuid: playerUUID
        });

        console.log(`Player joined: ${data.playerName}`);
    });

    // 准备阶段 - 开始游戏
    socket.on('startGame', () => {
        console.log('Start game received');
        if (!gameState.room || socket.id !== gameState.room.god) {
            console.log('Invalid start game request');
            return;
        }

        try {
            // 重置曝光列表
            gameState.exposedPlayers = [];
            // 重置已翻开玩家列表
            gameState.revealedPlayers = [];

            // 分配环境牌
            gameState.envCards = drawEnvCards();

            // 分配身份
            const identityArray = identityConfig[gameState.room.mode][String(gameState.room.playerCount)];
            if (!identityArray) {
                console.error(`Identity config not found for mode: ${gameState.room.mode}, player count: ${gameState.room.playerCount}`);
                return;
            }
            const shuffledIdentities = shuffleArray([...identityArray]); // 创建副本

            console.log(`Assigning identities: ${shuffledIdentities}`);

            // 给玩家分配身份（跳过主持人）
            const players = gameState.players.filter(p => p.role === 'player');
            players.forEach((player, index) => {
                player.identity = shuffledIdentities[index];
                // 添加阵营信息，保留属性未来备用
                player.camp = ['屁者', '响屁者', '小丑'].includes(player.identity) ? 'pee' : 'passenger';
                console.log(`Assigned ${player.identity} to ${player.name}`);
            });

            // 初始化行动牌堆
            gameState.actionDeck = generateActionCards();
            // 接收shuffleArray的返回值，确保牌组被打乱
            gameState.actionDeck = shuffleArray(gameState.actionDeck);

            // 角色按钮数组（打乱顺序）
            const characterButtons = shuffleArray([
                '领导', '保安', '社会人', '保洁阿姨', '外卖小哥', '大厨', '网红', // 'JK少女',
                '宝宝', 'iRobot', '房东', '班主任', '阳光男孩', '鼻窦炎小孩', '臭嘴男', '烟男',
                '外乡人', '纸袋头', '老中医', '医生', '地主', '忍者', '侦探', '女巫', '社恐',
                '僵尸', '中介', '律师', '阿Q', '非酋', '变脸', '盲侠', '树精', '镖师', '小偷',
                '横纲', '键盘侠', '匹诺曹', '透明人', '吸血鬼', '南瓜头', '孙悟空', '林黛玉',
                '预言家', '特战员', '催眠师', '修理工', '接听员', 'Robot', '外星人', '诸葛亮',
                '美食家', '喵星人', '瘟疫医生', '榜一大哥', '电梯战神', '屁负比丘尼', // '黑旋风李逵',
                '忧郁的女士', '哈姆雷特', '捉妖师', '奥本海默', '雷电法王', '少爷', '丁一白',
                '外卖小妹', '梁山伯', '祝英台', '吕洞宾', '钟离权', '铁拐李', '张果老', '蓝采和',
                '曹国舅', '韩湘子', '何仙姑', '钟馗'
            ]);

            // 给每位玩家分配角色选项
            let buttonIndex = 0;
            players.forEach(player => {
                player.handCards = [];
                player.characterOptions = [
                    characterButtons[buttonIndex],
                    characterButtons[buttonIndex + 1]
                ];
                buttonIndex += 2;

                // 发4张初始手牌
                for (let i = 0; i < 4; i++) {
                    if (gameState.actionDeck.length > 0) {
                        // 从头部取元素，符合发牌规则
                        player.handCards.push(gameState.actionDeck.shift());
                    }
                }
                console.log(`Dealt 4 cards to ${player.name}`);
            });

            gameState.gameStarted = true;

            // 重置已翻开玩家列表
            gameState.revealedPlayers = [];

            // 发出游戏开始事件
            io.emit('gameStarted', {
                players: gameState.players,
                envCards: gameState.envCards,
                roomMode: gameState.room.mode,
                roomId: gameState.room.id,
                playerCount: gameState.room.playerCount
            });

            console.log('Game started event emitted');
        } catch (error) {
            console.error('Error starting game:', error);
        }
    });

    // 翻牌事件
    socket.on('revealEnvCard', (data) => {
        if (!gameState.room) return;

        const player = gameState.players.find(p => p.uuid === data.uuid);
        if (!player || player.role !== 'god') return;

        const cardIndex = data.cardIndex;
        if (cardIndex >= 0 && cardIndex < gameState.envCards.length) {
            gameState.envCards[cardIndex].revealed = true;

            // 通知所有玩家环境牌已翻开
            io.emit('cardFlipped', {
                cardIndex: cardIndex,
                card: gameState.envCards[cardIndex]
            });

            // 更新环境牌表格
            io.emit('updateEnvTable', {
                cardIndex: cardIndex,
                card: gameState.envCards[cardIndex]
            });
        }
    });

    // 请求玩家信息更新处理
    socket.on('requestPlayerInfoUpdate', () => {
        // 广播给所有玩家
        io.emit('updatePlayerInfo', {
            players: gameState.players
        });
    });

    // 玩家操作事件
    socket.on('playerAction', (data) => {
        const player = gameState.players.find(p => p.uuid === data.uuid);
        if (!player || player.role !== 'player') return;

        switch (data.type) {
            case 'emptyBet':
                // 记录空押行动
                player.actions[gameState.currentRound] = {
                    type: 'emptyBet',
                    round: data.round
                };
                break;

            case 'bet':
                // 记录押牌行动
                player.actions[gameState.currentRound] = {
                    type: 'bet',
                    card: data.card,
                    round: data.round
                };

                // 从玩家手牌中移除
                if (data.cardIndex >= 0 && data.cardIndex < player.handCards.length) {
                    player.handCards.splice(data.cardIndex, 1);

                    // 通知玩家更新手牌
                    socket.emit('updateHandCards', {
                        uuid: player.uuid,
                        handCards: player.handCards
                    });
                }
                break;

            case 'draw':
                // 摸牌操作
                if (gameState.actionDeck.length > 0 && player.handCards.length < 16) {
                    // 从头部取元素，符合发牌规则
                    const card = gameState.actionDeck.shift();
                    player.handCards.push(card);

                    // 通知玩家更新手牌
                    socket.emit('updateHandCards', {
                        uuid: player.uuid,
                        handCards: player.handCards
                    });
                }
                break;

            case 'steal':
                // 抢夺手牌
                const targetPlayer = gameState.players.find(p =>
                    p.role === 'player' && p.playerId === data.targetPlayerId
                );

                if (targetPlayer && targetPlayer.handCards.length > 0 && player.handCards.length < 16) {
                    // 随机选取一张牌
                    const randomIndex = Math.floor(Math.random() * targetPlayer.handCards.length);
                    const stolenCard = targetPlayer.handCards.splice(randomIndex, 1)[0];

                    // 添加到当前玩家
                    player.handCards.push(stolenCard);

                    // 通知两个玩家更新手牌
                    socket.emit('updateHandCards', {
                        uuid: player.uuid,
                        handCards: player.handCards
                    });
                    io.to(targetPlayer.id).emit('updateHandCards', {
                        uuid: targetPlayer.uuid,
                        handCards: targetPlayer.handCards
                    });
                }
                break;

            case 'exchange':
                // 换牌操作
                const exchangeTarget = gameState.players.find(p =>
                    p.role === 'player' && p.playerId === data.targetPlayerId
                );

                if (exchangeTarget) {
                    // 交换手牌
                    const tempHandCards = [...player.handCards];
                    player.handCards = [...exchangeTarget.handCards];
                    exchangeTarget.handCards = tempHandCards;

                    // 通知两个玩家更新手牌
                    socket.emit('updateHandCards', {
                        uuid: player.uuid,
                        handCards: player.handCards
                    });
                    io.to(exchangeTarget.id).emit('updateHandCards', {
                        uuid: exchangeTarget.uuid,
                        handCards: exchangeTarget.handCards
                    });
                }
                break;

            case 'discard':
                // 弃牌操作
                if (data.cardIndex >= 0 && data.cardIndex < player.handCards.length) {
                    player.handCards.splice(data.cardIndex, 1);

                    // 通知玩家更新手牌
                    socket.emit('updateHandCards', {
                        uuid: player.uuid,
                        handCards: player.handCards
                    });
                }
                break;
        }

        // 在所有操作后强制更新玩家信息
        io.emit('updatePlayerInfo', {
            players: gameState.players
        });

        // 广播游戏状态更新给所有玩家
        io.emit('gameStateUpdate', gameState);
        // break;

        // 更新游戏状态（只通知当前玩家更新自己的行动历史）
        // socket.emit('gameStateUpdate', gameState);
    });

    // 角色选择事件
    socket.on('selectCharacter', (data) => {
        const player = gameState.players.find(p => p.uuid === data.uuid);
        if (!player || player.role !== 'player') return;

        player.selectedCharacter = data.character;

        // 通知所有玩家更新角色信息
        io.emit('updatePlayerInfo', {
            players: gameState.players
        });
    });

    // 血量修改事件
    socket.on('updateHp', (data) => {
        const player = gameState.players.find(p => p.uuid === data.uuid);
        if (!player || player.role !== 'player') return;

        // 只能修改自己的血量
        const targetPlayer = gameState.players.find(p => p.uuid === data.targetUuid);
        if (!targetPlayer || player.uuid !== targetPlayer.uuid) return;

        // 血量范围限制 (0-5)
        const newHp = Math.max(0, Math.min(5, targetPlayer.hp + data.delta));
        targetPlayer.hp = newHp;

        // 通知所有玩家更新血量信息
        io.emit('updatePlayerInfo', {
            players: gameState.players
        });
    });

    // 玩家查验事件
    socket.on('playerCheck', (data) => {
        // 这里可以记录查验日志，但不需要广播
        console.log(`${data.name} 查验了 ${data.targetName}`);
    });

    // 曝光身份事件处理
    socket.on('exposeIdentity', (data) => {
        const player = gameState.players.find(p => p.uuid === data.uuid);
        const targetPlayer = gameState.players.find(p => p.uuid === data.targetUuid);

        if (player && targetPlayer) {
            // 避免重复曝光
            if (!gameState.exposedPlayers.includes(targetPlayer.uuid)) {
                gameState.exposedPlayers.push(targetPlayer.uuid);

                // 通知所有客户端
                io.emit('identityExposed', {
                    targetUuid: targetPlayer.uuid
                });

                // 更新玩家信息
                io.emit('updatePlayerInfo', {
                    players: gameState.players
                });
            }
        }
    });

    // 公示技能事件
    socket.on('announceSkill', (data) => {
        const player = gameState.players.find(p => p.uuid === data.uuid);
        if (!player || player.role !== 'player') return;

        // 存储公示的技能
        const skillData = {
            playerName: player.name,
            skillCode: data.skillCode,
            skillText: data.skillText,
            timestamp: Date.now()
        };
        gameState.announcedSkills.push(skillData);

        // 广播给所有玩家
        io.emit('skillAnnounced', {
            playerName: player.name,
            skillCode: data.skillCode,
            skillText: data.skillText
        });
    });

    // 私聊消息处理
    socket.on('sendMessageToHost', (data) => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player || player.role !== 'player') return;

        // 更新最后联系的玩家
        lastMessenger = player.uuid;

        // 找到主持人
        const host = gameState.players.find(p => p.role === 'god');
        if (host) {
            // 发送消息给主持人
            io.to(host.id).emit('messageFromPlayer', {
                message: `${player.name}: ${data.message}`
            });
        }
    });

    socket.on('sendMessageToPlayer', (data) => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player || player.role !== 'god') return;

        if (lastMessenger) {
            // 找到最后联系的玩家
            const targetPlayer = gameState.players.find(p => p.uuid === lastMessenger);
            if (targetPlayer) {
                // 发送消息给该玩家
                io.to(targetPlayer.id).emit('messageFromHost', {
                    message: `主持人: ${data.message}`
                });
            }
        }
    });

    // 主持人处理请求
    socket.on('sendRequestToHost', (data) => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player || player.role !== 'player') return;

        // 找到主持人
        const host = gameState.players.find(p => p.role === 'god');
        if (host) {
            // // 记录请求者的socket ID
            // lastRequester = socket.id;

            // // 转发请求给主持人
            // io.to(host.id).emit('operationRequest', {
            //     playerName: player.name,
            //     actionType: data.actionType
            // });

            // 将请求加入队列
            requestQueue.push({
                playerId: socket.id,
                playerName: player.name,
                actionType: data.actionType
            });

            // 仅当队列长度为1时，通知主持人（避免重复通知）
            if (requestQueue.length === 1) {
                notifyHost(host.id);
            }
        }
    });

    // 通知主持人函数
    function notifyHost(hostId) {
        if (requestQueue.length > 0) {
            const request = requestQueue[0];
            io.to(hostId).emit('operationRequest', {
                playerName: request.playerName,
                actionType: request.actionType
            });
        }
    }

    // 处理主持人响应
    socket.on('approvalResponse', (data) => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player || player.role !== 'god') return;

        // // 将批准结果发送回请求的玩家
        // if (lastRequester) {
        //     io.to(lastRequester).emit('approvalResult', {
        //         approved: data.approved
        //     });
        //     // 重置请求发起玩家
        //     lastRequester = null;
        // }

        // 处理队列首个请求
        if (requestQueue.length > 0) {
            const currentRequest = requestQueue.shift();
            io.to(currentRequest.playerId).emit('approvalResult', {
                approved: data.approved
            });

            // 继续处理下一个请求
            notifyHost(socket.id);
        }
    });

    // 处理翻开请求
    socket.on('revealPlayerAction', (data) => {
        const player = gameState.players.find(p => p.uuid === data.uuid);
        if (!player || player.role !== 'god') return;

        // 获取所有玩家（排除主持人）
        const players = gameState.players
            .filter(p => p.role === 'player')
            .sort((a, b) => a.playerId - b.playerId);

        // 检查是否还有未翻开的玩家
        if (gameState.revealedPlayers.length >= players.length) return;

        // 获取下一个玩家
        const nextPlayer = players[gameState.revealedPlayers.length];
        const action = nextPlayer.actions[data.round];

        // 确定行动文本
        let actionText = '-';
        if (action) {
            if (action.type === 'emptyBet') {
                actionText = '空押';
            } else if (action.type === 'bet' && action.card) {
                actionText = action.card.name;
            }
        }

        // 广播行动信息
        io.emit('playerActionRevealed', {
            playerId: nextPlayer.playerId,
            playerName: nextPlayer.name,
            round: data.round,
            actionText: actionText
        });

        // 记录已翻开的玩家
        gameState.revealedPlayers.push(nextPlayer.uuid);
    });

    // 下一轮事件
    socket.on('nextRound', (data) => {
        const player = gameState.players.find(p => p.uuid === data.uuid);
        if (!player || player.role !== 'god') return;

        // 检查所有玩家是否都已完成操作
        const allPlayersActed = gameState.players
            .filter(p => p.role === 'player')
            .every(p => p.actions && p.actions[gameState.currentRound]);

        if (!allPlayersActed) {
            socket.emit('actionIncomplete');
            return;
        }

        // 进入下一轮
        gameState.currentRound++;

        // 重置已翻开玩家列表
        gameState.revealedPlayers = [];

        // 重置玩家的当前操作状态
        gameState.players.forEach(p => {
            if (p.role === 'player') {
                p.currentAction = null;
            }
        });

        // 通知所有玩家游戏状态更新
        io.emit('gameStateUpdate', gameState);

        console.log(`Next round: ${gameState.currentRound}`);
    });

    // // 断开连接处理
    // socket.on('disconnect', () => {

    //     // console.log('Client disconnected');

    //     // // 移除断开连接的玩家
    //     // const disconnectedPlayer = gameState.players.find(p => p.id === socket.id);
    //     // if (disconnectedPlayer) {
    //     //     console.log(`Player disconnected: ${disconnectedPlayer.name}`);
    //     // }

    //     // gameState.players = gameState.players.filter(player => player.id !== socket.id);

    //     const player = gameState.players.find(p => p.id === socket.id);
    //     if (player) {
    //         player.connected = false; // 标记为断开而非移除
    //         console.log(`Player disconnected: ${player.name}`);
    //         io.emit('playerDisconnected', { uuid: player.uuid });
    //     }

    //     处理主持人断开连接
    //     if (gameState.room && gameState.room.god === socket.id) {
    //         console.log('Host disconnected, resetting room');
    //         gameState.room = null;
    //         gameState.players = [];
    //         gameState.gameStarted = false;
    //         io.emit('roomReset');
    //     } else if (gameState.players.length > 0) {
    //         io.emit('playerJoined', {
    //             players: gameState.players
    //         });
    //     }

    //     // 主持人断开特殊处理
    //     // if (gameState.room && gameState.room.god === socket.id) {
    //     //     gameState.room.godDisconnected = true; // 标记主持人断开
    //     // }
    // });

    // // 玩家重连事件处理
    // socket.on('reconnectPlayer', (data) => {
    //     const player = gameState.players.find(p => p.uuid === data.uuid);

    //     if (player) {
    //         player.id = socket.id; // 更新socket ID
    //         player.connected = true; // 标记为已连接

    //         // 如果是主持人恢复
    //         // if (player.role === 'god' && gameState.room) {
    //         //     gameState.room.god = socket.id;
    //         //     delete gameState.room.godDisconnected;
    //         // }

    //         // 发送当前游戏状态
    //         socket.emit('gameStateUpdate', gameState);
    //         io.emit('playerReconnected', { uuid: player.uuid });
    //     }
    // });

    // 断开连接处理
    socket.on('disconnect', () => {
        console.log('Client disconnected');

        // 找到断开连接的玩家
        const disconnectedPlayer = gameState.players.find(p => p.id === socket.id);
        if (disconnectedPlayer) {
            console.log(`Player disconnected: ${disconnectedPlayer.name}`);
            // 标记为断开状态而非移除
            disconnectedPlayer.connected = false;
            // 通知所有玩家该玩家已断开
            io.emit('playerDisconnected', { uuid: disconnectedPlayer.uuid });
        }

        // 处理主持人断开连接 - 不再重置游戏状态
        if (gameState.room && gameState.room.god === socket.id) {
            console.log('Host disconnected, marking as disconnected');
            // 只是记录上帝断开，不重置游戏
            if (disconnectedPlayer) {
                disconnectedPlayer.connected = false;
            }
        }

        // 通知其他玩家更新玩家列表
        if (gameState.players.length > 0) {
            io.emit('playerJoined', {
                players: gameState.players
            });
        }
    });

    // 辅助函数：洗牌
    function shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }

    // 辅助函数：抽取环境牌
    function drawEnvCards() {
        const envCards = [...cards.envCards];
        const drawnCards = [];

        // 添加4张"无屁"
        for (let i = 0; i < 4; i++) {
            const noFartCard = envCards.find(c => c.name === "无屁");
            if (noFartCard) {
                drawnCards.push({ ...noFartCard, revealed: false });
            }
        }

        // 添加2张"有屁"
        for (let i = 0; i < 2; i++) {
            const smallFartCard = envCards.find(c => c.name === "有屁");
            if (smallFartCard) {
                drawnCards.push({ ...smallFartCard, revealed: false });
            }
        }

        // 添加2张大屁牌
        const bigFartCards = envCards.filter(c => ["有臭屁", "有闷屁", "有蔫儿屁", "有彩虹屁", "有连环屁"].includes(c.name));

        // 随机选择2张大屁牌
        shuffleArray(bigFartCards);

        const arr = [1, 2, 3, 4, 5];
        // 生成第一个随机索引
        const index1 = Math.floor(Math.random() * arr.length);
        // 生成第二个不重复的随机索引
        let index2;
        do {
            index2 = Math.floor(Math.random() * arr.length);
        } while (index2 === index1);

        drawnCards.push({ ...bigFartCards[index1], revealed: false });
        drawnCards.push({ ...bigFartCards[index2], revealed: false });

        return shuffleArray(drawnCards);
    }

    // 玩家重连事件处理
    socket.on('reconnectPlayer', (data) => {
        const player = gameState.players.find(p => p.uuid === data.uuid);

        if (player) {
            player.id = socket.id; // 更新socket ID
            player.connected = true; // 标记为已连接

            // 如果是主持人恢复，更新上帝socket ID
            if (player.role === 'god' && gameState.room) {
                gameState.room.god = socket.id;
                console.log('Host reconnected:', player.name);
            } else {
                console.log('Player reconnected:', player.name);
            }

            // 发送完整游戏状态给重连的玩家
            socket.emit('gameStateUpdate', gameState);
            
            // 同步已公示的技能给重连的玩家
            gameState.announcedSkills.forEach(skill => {
                socket.emit('skillAnnounced', {
                    playerName: skill.playerName,
                    skillCode: skill.skillCode,
                    skillText: skill.skillText
                });
            });
            
            // 通知所有玩家该玩家已重连
            io.emit('playerReconnected', { uuid: player.uuid });
            
            // 通知所有玩家更新玩家列表
            io.emit('playerJoined', {
                players: gameState.players
            });
        } else {
            console.log('Reconnect failed: Player not found with UUID:', data.uuid);
        }
    });

    // 辅助函数：生成行动牌
    function generateActionCards() {
        const actionCards = [];

        cards.actionCards.forEach(card => {
            for (let i = 0; i < card.count; i++) {
                actionCards.push({
                    id: card.id,
                    name: card.name,
                    type: card.type
                });
            }
        });

        return actionCards;
    }
});

const PORT = process.env.PORT || 3080;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));