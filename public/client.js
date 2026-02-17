// 玩家发起操作请求的全局变量
let approvalPending = false;

// 当前翻开的玩家索引
let revealIndex = 0;

// 高亮翻开的行动牌
let lastHighlightedCell = null;

// 当前轮次和行动状态
let currentRound = 1;
let actionTaken = false;

document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    setupRulesButton();

    // 页面加载时检查是否有保存的游戏数据
    const savedData = localStorage.getItem('pzxnGameData');
    if (savedData) {
        try {
            const gameData = JSON.parse(savedData);
            console.log('Found saved game data, attempting to restore session...');
            
            // 恢复本地状态
            if (gameData.currentPlayer) {
                currentPlayer.uuid = gameData.currentPlayer.uuid;
                currentPlayer.playerId = gameData.currentPlayer.playerId;
                currentPlayer.name = gameData.currentPlayer.name;
                currentPlayer.role = gameData.currentPlayer.role;
                currentPlayer.identity = gameData.currentPlayer.identity;
                currentPlayer.handCards = gameData.currentPlayer.handCards || [];
                currentPlayer.isGod = gameData.currentPlayer.role === 'god';
                
                // 立即更新页面上显示的玩家信息
                document.getElementById('playerNameDisplay').textContent = gameData.currentPlayer.name || '';
                document.getElementById('playerIdDisplay').textContent = gameData.currentPlayer.playerId || '';
                document.getElementById('playerIdentity').textContent = gameData.currentPlayer.identity || '';
                
                // 渲染手牌表格
                renderHandCardsTable();
            }
            
            if (gameData.room) {
                gameState.room = gameData.room;
            }
        } catch (error) {
            console.error('Failed to parse saved game data:', error);
        }
    }

    // DOM元素
    const createRoomSection = document.getElementById('createRoomSection');
    const joinRoomSection = document.getElementById('joinRoomSection');
    const playerListSection = document.getElementById('playerListSection');
    const gameArea = document.getElementById('gameArea');
    const skillSection = document.getElementById('skillSection');
    const handCardsSection = document.getElementById('handCardsSection');
    const actionColumnHeader = document.getElementById('actionColumnHeader');

    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const startGameBtn = document.getElementById('startGameBtn');

    const roomIdDisplay = document.getElementById('roomIdDisplay');
    const playersTableBody = document.getElementById('playersTableBody');

    // 游戏区域元素
    const envCards = document.querySelectorAll('.env-card');
    const playersInfoBody = document.getElementById('playersInfoBody');
    const actionHistoryBody = document.getElementById('actionHistoryBody');

    // 手牌区域元素
    const handCardsTable = document.getElementById('handCardsTable');
    const playerActions = document.getElementById('playerActions');
    const godActions = document.getElementById('godActions');
    const emptyBetBtn = document.getElementById('emptyBetBtn');
    const betBtn = document.getElementById('betBtn');
    const drawBtn = document.getElementById('drawBtn');
    const stealBtn = document.getElementById('stealBtn');
    const exchangeBtn = document.getElementById('exchangeBtn');
    const discardBtn = document.getElementById('discardBtn');

    // 主持人翻开行动牌和下一轮按钮
    const godRevealBtn = document.getElementById('godRevealBtn');
    const godNextRoundBtn = document.getElementById('godNextRoundBtn');

    // 技能介绍区域元素
    const skillInput = document.getElementById('skillInput');
    const skillPreview = document.getElementById('skillPreview');
    const announceSkillBtn = document.getElementById('announceSkillBtn');
    const announcedSkills = document.getElementById('announcedSkills');

    // 玩家选择浮窗
    const playerSelectionModal = document.getElementById('playerSelectionModal');
    const playerButtons = document.getElementById('playerButtons');
    const cancelPlayerSelection = document.getElementById('cancelPlayerSelection');

    // 私聊控件
    const messageInput = document.getElementById('messageInput');
    const messageOutput = document.getElementById('messageOutput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');

    // 技能映射表
    const skillMap = {
        'ld': '（领导）：每有一位玩家弃票，该回合投票+0.5',
        'ba': '（保安）：其他玩家离场后，独自检视其身份',
        'shr': '（社会人）：投票始终+0.5',
        'bjay': '（保洁阿姨）：离场时，可为一位玩家恢复1点血',
        'wmxg': '（外卖小哥）：首次离场后，保留1张手牌，下回合结束后以1血返场，下回为最后轮时禁返',
        'dc': '（大厨）：将所有屁牌的伤害视为1',
        'wh': '（网红）：投票阶段结束时，可选择一位玩家PK，本回合已有平票PK则无法触发',
        'jksn': '（JK少女）：空押和出局时仍可发言，其他玩家发言时可插话',
        'bb': '（宝宝）：背负票数始终-0.5，不低于0',
        'irobot': '（iRobot）：将吹和抓当忍使用，不触发吹抓效果',
        'fd': '（房东）：骂可以选择抽玩家的牌',
        'bzr': '（班主任）：每回合一次，可弃1张手牌终止1位玩家本回合发言，包括淘汰时和技能发言',
        'ygnh': '（阳光开朗大男孩）：无',
        'bdyxh': '（鼻窦炎小孩）：血量+1，投票始终-0.5',
        'czn': '（臭嘴男）：吹不限距离，无屁仍可吹',
        'yn': '（烟男）：背负票数始终-0.5，有屁回合吸不生效',
        'wxr1': '（外乡人）：其他玩家被投票离场时，你抽1张牌',
        'zdt': '（纸袋头）：血量+1，活跃时不可被独自检视身份',
        'lzy': '（老中医）：有屁回合触发吸时，独自检视1位活跃玩家身份，受伤出局时不触发',
        'ys': '（医生）：押牌阶段结束时，可用手牌为空押玩家押注',
        'dz': '（地主）：活跃玩家为3人时，投票+1',
        'rz': '（忍者）：忍免疫所有伤害，包括不可防御和精神伤害',
        'zt': '（侦探）：玩家被投票离场时，公示其身份，为屁者阵营，你恢复1点血，非屁阵，你离场',
        'nw': '（女巫）：可为空血即将出局玩家恢复1点血，或于自己行动阶段对一位玩家造成不可防1血伤，整局限一次',
        'sk': '（社恐）：血量+1，跳过首个发言阶段',
        'js': '（僵尸）：空血不出局，但无法发言和投票，游戏结束时不算作人数',
        'zj': '（中介）：你的行动阶段可弃2张相同手牌，使两位其他玩家互相单独检视身份',
        'ls': '（律师）：无屁用骂时，在行动阶段结束后可开启发言和投票，此投票阶段骂无票数加成和不可弃票效果',
        'aq': '（阿Q）：骂防1点屁牌伤害，与人对投时，对方投票数+1',
        'fq': '（非酋）：1号环境为屁，抽2张牌，连续出现屁，抽1张牌',
        'bl': '（变脸）：吸抽牌-1，有屁回合可弃牌重押，重押时不可空押',
        'mx': '（盲侠）：可将2张相同的手牌当1张听押牌',
        'sj': '（树精）：无屁回合，吹使所有玩家抽1张牌，从你开始抽',
        'bs': '（镖师）：可将2张手牌当作1张抓押牌或打出',
        'xt': '（小偷）：被投票离场时，可选择一位玩家，由你随机抽取其等同你血量的手牌弃除',
        'hg': '（横纲）：游戏结束时，结算人数视为2',
        'jpx': '（键盘侠）：活跃时投票-0.5，离场后仍可发言和投票，票数为1',
        'pnc': '（匹诺曹）：有屁回合可消耗1点血，不翻开押牌，押牌当任意行动牌触发效果',
        'tmr': '（透明人）：满血时投票为0，无法被投票，残血时失效，游戏结束时，结算人数视为0',
        'xxg': '（吸血鬼）：吸可选玩家，抽取2人各1张或某人2张手牌',
        'ngt': '（南瓜头）：血量+1，吹对你伤害+1',
        'swk': '（孙悟空）：复制技能，不含离场时/后的效果',
        'ldy': '（林黛玉）：空血离场时，独自检视1位活跃玩家身份，剩余手牌可弃除或给任意1位玩家',
        'yyj': '（预言家）：首个押牌阶段开始时，独自检视8号环境牌',
        'tzy': '（特战员）：有玩家发动吹或抓造成伤害时，独自检视其身份，每回合一次，你受伤出局时无效',
        'cms': '（催眠师）：行动阶段开始时，可与人互换押牌，她血少时无法拒绝，她多押则其选1张与你换',
        'xlg': '（修理工）：离场时，可打出2张相同手牌，移除1张未触发的环境牌，最多移除1张且不公开',
        'jty': '（接听员）：有人触发听，你也单独检视被听者身份',
        'robot': '（Robot）：每回合一次，回合内受到伤害大于1，可单独检视1张未触发的环境牌，出局时无法检视',
        'wxr2': '（外星人）：押牌阶段结束时，可弃除2张手牌，对调2张尚未触发的环境牌位置',
        'zgl1': '（诸葛亮）：押骂时，其他玩家骂没有+0.5效果',
        'msj': '（美食家）：本回合每受到1点伤害，投票+0.5',
        'mxr': '（喵星人）：离场后可将剩余手牌给1位活跃玩家，游戏结束时，该玩家没有离场则结算人数+0.5',
        'wyys': '（瘟疫医生）：血量+1，不可主动空押或弃票',
        'bydg': '（榜一大哥）：投票结束时，可弃除任意张手牌，每张使本次投票+0.5，票型确定后触发',
        'dtzs': '（电梯战神）：伤你者，受同等伤害',
        'hxflk': '（黑旋风李逵）：空血不立刻出局，本回合结束时出局',
        'pfbqn': '（屁负比丘尼）：可代替被投票出局玩家，并将剩余手牌给她',
        'yydns': '（忧郁的女士）：离场时，替换一位活跃玩家角色牌，并禁止被替角色触发任何技能',
        'hmlt': '（哈姆雷特）：自定义技能，但是得半数以上的人同意',
        'zys': '（捉妖师）：2张相同的牌可当1张抓，目标身份为“它”时直接致死（不可以复活）',
        'abhm': '（奥本海默）：开局手牌+1，离场时可将4张相同手牌打出，令一名玩家不可复活性死亡（无视忍效果）',
        'ldfw': '（雷电法王）：每当有其他玩家触摸手机时，可选择立即对其造成1点伤害',
        'sy': '（少爷）：初始血量3，开局抽牌+3',
        'dyb': '（丁一白）：开局手牌+1，若有玩家为“喵星人”，则游戏结束结算人数时，我方+0.5',
        'wmxm': '（外卖小妹）：首次离场后，可选择于下回合开始或结束时返场，仅保留1点血',
        'lsb': '（梁山伯）：开局单独检视“祝英台”身份，“祝英台”出局时，“梁山伯”受到3点不可防御的伤害',
        'zyt': '（祝英台）：开局单独检视“梁山伯”身份，“梁山伯”出局时，“祝英台”受到3点不可防御的伤害',
        'ldb': '（吕洞宾）：其他玩家空血出局时独自检视其身份，可选择消耗1点血使该玩家保留1点血返场，每回合1次，自己1血时无法发动效果',
        'zlq': '（钟离权）：血量5，行动阶段可消耗1点血，为相邻1位玩家恢复1点血，每回合1次',
        'tgl': '（铁拐李）：行动阶段可弃除2张相同手牌，与1位空押玩家交换血量',
        'zgl2': '（张果老）：受到大于等于当前血量的伤害时，可弃除全部手牌，免疫本轮任何伤害，且本轮无法被投票，仅限本回合，手牌为0不触发技能',
        'lch': '（蓝采和）：当你没有手牌被迫空押时，防御本回合所有伤害',
        'cgj': '（曹国舅）：当血量高于你投票的对象时，每比其多1点血，票数+0.5',
        'hxz': '（韩湘子）：无屁时吹为相邻2位玩家各恢复1点血，有屁回合相邻的2位各自受到吹的伤害',
        'hxg': '（何仙姑）：连续出现无屁时，恢复1点血，不可超过4点血',
        'zk': '（钟馗）：血量-1，免疫精神伤害，每回合闭眼阶段单独咨询主持人1位玩家是否为小丑，若自己是探员，则叠加身份和角色技能',
        'wxr': '请输入wxr1查看外乡人，wxr2查看外星人',
        'zgl': '请输入zgl1查看诸葛亮，zgl2查看张果老'
    };

    // 添加主持人批准浮窗
    const approvalModal = document.createElement('div');
    approvalModal.id = 'approvalModal';
    approvalModal.className = 'modal';
    approvalModal.style.display = 'none';
    approvalModal.innerHTML = `
        <div class="modal-content">
            <h3>请求审批</h3>
            <p id="approvalMessage">请批准操作</p>
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button id="approveBtn" style="background-color: #4CAF50; color: white;">通过</button>
                <button id="rejectBtn" style="background-color: #f44336; color: white;">驳回</button>
            </div>
        </div>
    `;
    document.body.appendChild(approvalModal);

    // 主持人批准按钮事件
    document.getElementById('approveBtn').addEventListener('click', () => {
        socket.emit('approvalResponse', { approved: true });
        document.getElementById('approvalModal').style.display = 'none';
    });

    // 主持人驳回按钮事件
    document.getElementById('rejectBtn').addEventListener('click', () => {
        socket.emit('approvalResponse', { approved: false });
        document.getElementById('approvalModal').style.display = 'none';
    });

    // 监听玩家请求
    socket.on('operationRequest', (data) => {
        if (currentPlayer.isGod) {
            document.getElementById('approvalMessage').textContent =
                `${data.playerName} 请求: ${data.actionType}`;
            document.getElementById('approvalModal').style.display = 'flex';
        }
    });

    // 监听批准结果
    socket.on('approvalResult', (data) => {
        // 重置请求状态
        approvalPending = false;

        if (data.approved) {
            // 根据操作类型执行后续代码
            switch (currentActionType) {
                case 'hpMinus':
                    socket.emit('updateHp', {
                        uuid: currentPlayer.uuid,
                        targetUuid: currentPlayer.uuid,
                        delta: -1
                    });
                    break;
                case 'hpPlus':
                    socket.emit('updateHp', {
                        uuid: currentPlayer.uuid,
                        targetUuid: currentPlayer.uuid,
                        delta: 1
                    });
                    break;
                case 'check':
                    const targetUuid = currentActionData.targetUuid;
                    if (!currentPlayer.checkedPlayers.includes(targetUuid)) {
                        currentPlayer.checkedPlayers.push(targetUuid);
                        // 更新玩家信息显示
                        renderPlayersInfoTable(gameState.players);
                        // 通知服务器记录查验操作
                        socket.emit('playerCheck', {
                            uuid: currentPlayer.uuid,
                            targetUuid: targetUuid
                        });
                    }
                    break;
                case 'expose':
                    socket.emit('exposeIdentity', {
                        uuid: currentPlayer.uuid,
                        targetUuid: currentActionData.targetUuid
                    });
                    break;
                case 'draw':
                    socket.emit('playerAction', {
                        type: 'draw',
                        uuid: currentPlayer.uuid
                    });
                    break;
                case 'steal':
                    showPlayerSelectionModal('steal');
                    break;
                case 'exchange':
                    showPlayerSelectionModal('exchange');
                    break;
            }
            // } else {
            //     alert('操作被主持人驳回');
        }
    });

    // 确保仅单次绑定查验和曝光按钮
    document.body.addEventListener('click', (e) => {
        if (!currentPlayer.isGod) {
            // 确保只在游戏区域处理
            if (!gameArea.style.display === 'block') return;

            if (e.target.classList.contains('check-btn')) {
                if (approvalPending) return;

                const targetUuid = e.target.dataset.uuid;

                // sendApprovalRequest('check');
                sendApprovalRequest('check', { targetUuid });

                // approvalPending = true;
                // currentActionType = 'check';
                // currentActionData = { targetUuid };

                // // 防止重复查验
                // // if (!currentPlayer.checkedPlayers.includes(targetUuid)) {
                // //     currentPlayer.checkedPlayers.push(targetUuid);
                // //     renderPlayersInfoTable(gameState.players);

                // // 发送请求给主持人
                // socket.emit('sendRequestToHost', {
                //     actionType: '查验身份',
                //     playerName: currentPlayer.name
                // });
                // // }
            } else if (e.target.classList.contains('expose-btn')) {
                if (approvalPending) return;

                const targetUuid = e.target.dataset.uuid;

                // sendApprovalRequest('expose');
                sendApprovalRequest('expose', { targetUuid });

                // approvalPending = true;
                // currentActionType = 'expose';
                // currentActionData = { targetUuid };

                // // 发送请求给主持人
                // socket.emit('sendRequestToHost', {
                //     actionType: '曝光玩家',
                //     playerName: currentPlayer.name
                // });
            }
        }
    });

    // 在发起请求时设置独立状态
    function sendApprovalRequest(actionType, actionData = null) {
        if (approvalPending) return;

        approvalPending = true;
        currentActionType = actionType;
        currentActionData = actionData;

        socket.emit('sendRequestToHost', {
            actionType: getActionDescription(actionType)
        });
    }

    // 玩家操作申请行为类型映射
    function getActionDescription(type) {
        const map = {
            hpMinus: '血量减少',
            hpPlus: '血量增加',
            check: '查验身份',
            expose: '曝光玩家',
            draw: '摸牌',
            steal: '抢牌',
            exchange: '换牌'
        };
        return map[type] || '未知操作';
    }

    // 根据模式更新人数选项
    function updatePlayerCountOptions() {
        const mode = document.getElementById('gameMode').value;
        const playerCountSelect = document.getElementById('playerCount');

        if (mode === 'normal') {
            playerCountSelect.innerHTML = ''; // 清空现有选项
            addOption(playerCountSelect, 7, '7人');
            addOption(playerCountSelect, 8, '8人');
            addOption(playerCountSelect, 9, '9人');
            addOption(playerCountSelect, 10, '10人');
        } else { // 里世界模式
            playerCountSelect.innerHTML = ''; // 清空现有选项
            addOption(playerCountSelect, 8, '8人');
            addOption(playerCountSelect, 9, '9人');
            addOption(playerCountSelect, 10, '10人');
        }
    }

    function addOption(selectElement, value, text) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        selectElement.appendChild(option);
    }

    // 初始化时调用一次
    updatePlayerCountOptions();
    // 监听模式变化
    document.getElementById('gameMode').addEventListener('change', updatePlayerCountOptions);

    // 防止超时自动锁屏 - 跨平台解决方案
    let wakeLock = null;
    let keepAwakeInterval = null;
    
    /**
     * 保持屏幕常亮的跨平台解决方案
     */
    function keepScreenAwake() {
        // 尝试使用现代的 Wake Lock API
        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen')
                .then((lock) => {
                    wakeLock = lock;
                    console.log('Wake Lock 已激活');
                    
                    // 监听释放事件，当屏幕被关闭时重新获取
                    wakeLock.addEventListener('release', () => {
                        console.log('Wake Lock 已释放');
                        // 当页面重新可见时尝试重新获取
                        if (document.visibilityState === 'visible') {
                            keepScreenAwake();
                        }
                    });
                })
                .catch((err) => {
                    console.warn('无法获取 Wake Lock:', err);
                    // 降级方案
                    useFallbackMethod();
                });
        } else {
            // 不支持 Wake Lock API，使用降级方案
            useFallbackMethod();
        }
    }
    
    /**
     * 降级方案：使用定时器模拟用户活动
     */
    function useFallbackMethod() {
        console.log('使用降级方案保持屏幕常亮');
        
        // 清除之前的定时器
        if (keepAwakeInterval) {
            clearInterval(keepAwakeInterval);
        }
        
        // 每10秒模拟一次用户活动
        keepAwakeInterval = setInterval(() => {
            if (!document.hidden) {
                // 模拟轻量级的DOM操作
                const dummyElement = document.createElement('div');
                dummyElement.style.position = 'fixed';
                dummyElement.style.top = '-100px';
                dummyElement.style.left = '-100px';
                dummyElement.style.width = '1px';
                dummyElement.style.height = '1px';
                dummyElement.style.opacity = '0';
                dummyElement.id = 'keep-awake-dummy';
                
                // 移除旧的dummy元素（如果存在）
                const oldDummy = document.getElementById('keep-awake-dummy');
                if (oldDummy) {
                    oldDummy.remove();
                }
                
                // 添加新的dummy元素
                document.body.appendChild(dummyElement);
                
                // 立即移除，只需要DOM操作的副作用
                setTimeout(() => {
                    dummyElement.remove();
                }, 0);
            }
        }, 10000);
    }
    
    /**
     * 停止保持屏幕常亮
     */
    function stopKeepScreenAwake() {
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
            console.log('Wake Lock 已释放');
        }
        
        if (keepAwakeInterval) {
            clearInterval(keepAwakeInterval);
            keepAwakeInterval = null;
            console.log('降级方案已停止');
        }
    }

    // 当前玩家状态
    let currentPlayer = {
        id: null,
        uuid: null,
        name: '',
        role: '',
        identity: '',
        playerId: -1,
        hp: 0,
        isGod: false,
        handCards: [],
        currentAction: null,
        checkedPlayers: [] // 存储该玩家查验过的玩家UUID
    };

    // 当前游戏状态
    let gameState = {
        room: null,
        players: [],
        envCards: [],
        actionDeck: [],
        gameStarted: false,
        currentRound: 1,
        exposedPlayers: [] // 存储被曝光玩家的UUID
    };

    // 当前操作状态
    let selectedCardElement = null;
    let selectedCardIndex = -1;
    let currentActionType = null;

    // 全局重连计时器
    let reconnectTimer;

    // 监听断开事件
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        // 如果游戏已开始，尝试重连
        if (gameState.gameStarted || currentPlayer.uuid) {
            console.log('Attempting to reconnect...');
            reconnectTimer = setInterval(() => {
                socket.connect(); // 尝试重新连接
            }, 5000); // 每5秒尝试一次
        }
    });

    // 监听重新连接事件
    socket.on('connect', () => {
        console.log('Connected to server');
        clearInterval(reconnectTimer);

        // 尝试恢复游戏状态
        const savedData = loadGameData();
        if (savedData && savedData.currentPlayer.uuid) {
            console.log('Attempting to restore game session...');
            // 发送重连请求
            socket.emit('reconnectPlayer', {
                uuid: savedData.currentPlayer.uuid
            });
        }
    });

    // 初始化手牌表格
    function initHandCardsTable() {
        handCardsTable.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const row = document.createElement('tr');
            for (let j = 0; j < 4; j++) {
                const cell = document.createElement('td');
                cell.dataset.index = i * 4 + j;
                cell.textContent = '';
                row.appendChild(cell);
            }
            handCardsTable.appendChild(row);
        }
    }

    // 渲染手牌表格
    function renderHandCardsTable() {
        const cells = handCardsTable.querySelectorAll('td');

        // 重置表格
        cells.forEach(cell => {
            cell.textContent = '';
            cell.classList.remove('selected');
            cell.style.backgroundColor = '';
        });

        // 填充手牌
        currentPlayer.handCards.forEach((card, index) => {
            if (index < 16) {
                const cellIndex = index;
                cells[cellIndex].textContent = card.name;
            }
        });

        // 添加点击事件
        cells.forEach(cell => {
            cell.addEventListener('click', () => {
                // 如果单元格是空的，则忽略
                if (cell.textContent === '') return;

                // 移除之前的高亮
                if (selectedCardElement) {
                    selectedCardElement.classList.remove('selected');
                }

                // 取消之前选中的单元格
                const prevSelected = handCardsTable.querySelector('.selected');
                if (prevSelected) prevSelected.classList.remove('selected');

                // 选中当前单元格并高亮
                cell.classList.add('selected');
                selectedCardElement = cell;
                selectedCardIndex = parseInt(cell.dataset.index);
            });
        });
    }

    // 初始化手牌表格
    initHandCardsTable();

    // 当页面加载时检查是否有房间存在
    socket.on('roomExists', (data) => {
        keepScreenAwake();
        createRoomSection.style.display = 'none';
        joinRoomSection.style.display = 'block';
        playerListSection.style.display = 'block';
        roomIdDisplay.textContent = data.roomId;
        renderPlayersTable(data.players);
    });

    // 创建房间
    createRoomBtn.addEventListener('click', () => {
        const gameMode = document.getElementById('gameMode').value;
        const playerCount = document.getElementById('playerCount').value;

        socket.emit('createRoom', {
            mode: gameMode,
            playerCount: parseInt(playerCount)
        });
    });

    // 加入房间
    joinRoomBtn.addEventListener('click', () => {
        const playerName = document.getElementById('playerName').value.trim();
        if (!playerName) {
            alert('请输入昵称');
            return;
        }

        // 禁用按钮并添加禁用样式
        joinRoomBtn.disabled = true;
        joinRoomBtn.classList.add('disabled-btn');

        socket.emit('joinRoom', {
            playerName: playerName
        });
    });

    // 添加禁用按钮的样式
    const style = document.createElement('style');
    style.textContent = `
    .disabled-btn {
        opacity: 0.6;
        cursor: not-allowed;
        background: #95a5a6 !important;
    }
`;
    document.head.appendChild(style);

    // 开始游戏
    startGameBtn.addEventListener('click', () => {
        socket.emit('startGame');
    });

    // 在创建房间后显示开始按钮
    socket.on('roomCreated', (data) => {
        keepScreenAwake();
        createRoomSection.style.display = 'none';
        joinRoomSection.style.display = 'none';
        playerListSection.style.display = 'block';
        startGameBtn.style.display = 'block'; // 确保显示开始按钮
        roomIdDisplay.textContent = data.roomId;
        renderPlayersTable(data.players);
    });

    // 保存游戏数据到localStorage
    function saveGameData() {
        const gameData = {
            currentPlayer: {
                uuid: currentPlayer.uuid,
                playerId: currentPlayer.playerId,
                name: currentPlayer.name,
                role: currentPlayer.role,
                identity: currentPlayer.identity,
                handCards: currentPlayer.handCards || []
            },
            room: gameState.room
        };
        localStorage.setItem('pzxnGameData', JSON.stringify(gameData));
    }

    // 从localStorage加载游戏数据
    function loadGameData() {
        const savedData = localStorage.getItem('pzxnGameData');
        if (savedData) {
            try {
                const gameData = JSON.parse(savedData);
                return gameData;
            } catch (error) {
                console.error('Failed to parse saved game data:', error);
                return null;
            }
        }
        return null;
    }

    // 接收房间信息
    socket.on('setRoomInfo', (data) => {
        keepScreenAwake();
        currentPlayer.uuid = data.uuid;
        roomIdDisplay.textContent = data.roomId;
        saveGameData();
    });

    // 接收玩家信息
    socket.on('setPlayerInfo', (data) => {
        keepScreenAwake();
        currentPlayer.playerId = data.playerId;
        currentPlayer.uuid = data.uuid;
        saveGameData();
    });

    // 接收玩家加入事件
    socket.on('playerJoined', (data) => {
        keepScreenAwake();
        renderPlayersTable(data.players);

        // 如果是主持人，检查是否满员并启用开始按钮
        if (currentPlayer.playerId === 0) {
            const playerCount = gameState.room.playerCount;
            const currentPlayers = data.players.filter(p => p.role === 'player').length;

            if (currentPlayers === playerCount) {
                startGameBtn.disabled = false;
            }
        }
    });

    // 接收游戏开始事件
    socket.on('gameStarted', (data) => {
        keepScreenAwake();
        console.log('Game started event received');

        // 初始化曝光玩家列表
        gameState.exposedPlayers = [];

        // 隐藏玩家列表区域，显示游戏区域
        playerListSection.style.display = 'none';
        gameArea.style.display = 'block';

        document.getElementById('roomId').textContent = data.roomId;
        document.getElementById('gameModeDisplay').textContent =
            data.roomMode === 'normal' ? '普通模式' : '里世界模式';
        document.getElementById('playerCountDisplay').textContent = data.playerCount;

        // 找到当前玩家
        const player = data.players.find(p => p.uuid === currentPlayer.uuid);
        if (player) {
            currentPlayer = player;
            currentPlayer.isGod = player.role === 'god';
            currentPlayer.checkedPlayers = []; // 重置查验列表
            messageOutput.value = ''; // 清空消息接收框

            // 更新玩家信息显示
            document.getElementById('playerNameDisplay').textContent = player.name;
            document.getElementById('playerIdDisplay').textContent = player.playerId;
            document.getElementById('playerIdentity').textContent = player.identity;

            // 初始化手牌
            if (player.role === 'player') {
                currentPlayer.handCards = player.handCards || [];
                renderHandCardsTable();
            }

            // 显示或隐藏技能介绍区域（主持人除外）
            skillSection.style.display = 'block';

            // 主持人不需要操作列
            actionColumnHeader.style.display = currentPlayer.isGod ? 'none' : 'table-cell';
        }

        // 更新游戏状态
        gameState = {
            ...gameState,
            players: data.players,
            envCards: data.envCards,
            room: {
                id: data.roomId,
                mode: data.roomMode,
                playerCount: data.playerCount
            },
            gameStarted: true,
            currentRound: 1
        };
        
        // 保存游戏数据到localStorage
        saveGameData();

        // 渲染环境牌
        renderEnvCards(data.envCards);
        renderEnvTable(data.envCards);

        // 渲染玩家信息表格
        renderPlayersInfoTable(data.players);

        // 初始化行动历史表格
        initActionHistoryTable();

        // 更新操作区域
        updateActionSection();

        console.log('Game area displayed');

        revealIndex = 0; // 重置翻开索引
        godRevealBtn.disabled = false; // 启用翻开按钮
    });

    // 更新操作区域
    function updateActionSection() {
        // 确保在游戏开始后隐藏所有不需要的区域
        joinRoomSection.style.display = 'none';
        createRoomSection.style.display = 'none';
        playerListSection.style.display = 'none';
        
        if (currentPlayer.isGod) {
            handCardsSection.style.display = 'none';
            playerActions.style.display = 'none';
            godActions.style.display = 'block';
        } else {
            handCardsSection.style.display = 'block';
            playerActions.style.display = 'grid';
            godActions.style.display = 'none';
        }
        
        // 确保游戏区域显示
        if (gameState.gameStarted) {
            gameArea.style.display = 'block';
        }
    }

    // 接收翻牌事件
    socket.on('cardFlipped', (data) => {
        keepScreenAwake();
        renderEnvCard(data.cardIndex, data.card);
        updateEnvTable(data.cardIndex, data.card);
    });

    // 接收环境牌更新事件
    socket.on('updateEnvTable', (data) => {
        keepScreenAwake();
        const cell = document.getElementById(`env-card-cell-${data.cardIndex}`);
        if (!cell) return;

        const isPassenger = !currentPlayer.isGod &&
            !['屁者', '响屁者', '小丑'].includes(currentPlayer.identity);

        if (isPassenger) {
            cell.textContent = data.card.revealed ? data.card.name : 'XC';
        } else {
            const button = cell.querySelector('button');
            if (button) {
                button.textContent = data.card.revealed ? data.card.name : 'XC';
            }
        }
    });

    // 接收手牌更新事件
    socket.on('updateHandCards', (data) => {
        keepScreenAwake();
        if (data.uuid === currentPlayer.uuid) {
            currentPlayer.handCards = data.handCards;
            renderHandCardsTable();
            selectedCardIndex = -1;
            // 更新localStorage中的手牌信息
            saveGameData();
        }
    });

    // 接收游戏状态更新事件
    socket.on('gameStateUpdate', (data) => {
        keepScreenAwake();

        // 保存旧轮次值
        const oldRound = gameState.currentRound;

        // 更新游戏状态
        gameState = data;
        console.log('Game state updated:', data);
        
        // 重置所有本地UI状态变量
        approvalPending = false;
        selectedCardElement = null;
        selectedCardIndex = -1;
        lastHighlightedCell = null;
        currentActionType = null;
        currentActionData = null;
        
        // 恢复本地状态变量
        currentRound = gameState.currentRound || 1;
        
        // 确保revealedPlayers数组存在
        if (!gameState.revealedPlayers) {
            gameState.revealedPlayers = [];
        }
        
        // 恢复revealIndex状态
        revealIndex = gameState.revealedPlayers.length;
        
        // 找到当前玩家
        const player = gameState.players.find(p => p.uuid === currentPlayer.uuid);
        
        // 恢复actionTaken状态
        if (player && player.actions) {
            actionTaken = !!player.actions[currentRound];
        } else {
            actionTaken = false;
        }
        
        // 恢复游戏界面
        if (gameState.gameStarted) {
            console.log('Restoring game interface...');
            // 隐藏玩家列表区域，显示游戏区域
            playerListSection.style.display = 'none';
            gameArea.style.display = 'block';
            joinRoomSection.style.display = 'none';
            createRoomSection.style.display = 'none';

            // 更新房间信息显示
            if (gameState.room) {
                document.getElementById('roomId').textContent = gameState.room.id || '';
                document.getElementById('gameModeDisplay').textContent = 
                    (gameState.room.mode === 'normal' ? '普通模式' : '里世界模式') || '';
                document.getElementById('playerCountDisplay').textContent = gameState.room.playerCount || '';
                roomIdDisplay.textContent = gameState.room.id || '';
            }

            // 找到当前玩家并更新信息
            if (player) {
                // 保存checkedPlayers数组
                const oldCheckedPlayers = currentPlayer.checkedPlayers || [];
                
                // 更新当前玩家信息
                currentPlayer = player;
                currentPlayer.isGod = player.role === 'god';
                
                // 恢复checkedPlayers数组（如果服务器没有同步，使用本地保存的）
                currentPlayer.checkedPlayers = player.checkedPlayers || oldCheckedPlayers;
                
                // 更新玩家信息显示
                document.getElementById('playerNameDisplay').textContent = player.name || '';
                document.getElementById('playerIdDisplay').textContent = player.playerId || '';
                document.getElementById('playerIdentity').textContent = player.identity || '';

                // 更新玩家手牌
                currentPlayer.handCards = player.handCards || [];
                renderHandCardsTable();
                // 更新localStorage中的手牌信息
                saveGameData();

                // 更新操作区域
                updateActionSection();
                
                // 渲染玩家信息表格
                renderPlayersInfoTable(gameState.players);
            } else {
                console.log('Player not found with UUID:', currentPlayer.uuid);
                console.log('Available players:', gameState.players.map(p => p.uuid));
                // 尝试从保存的游戏数据中恢复
                const savedData = loadGameData();
                if (savedData && savedData.currentPlayer) {
                    currentPlayer.uuid = savedData.currentPlayer.uuid;
                    currentPlayer.playerId = savedData.currentPlayer.playerId;
                    currentPlayer.name = savedData.currentPlayer.name;
                    currentPlayer.role = savedData.currentPlayer.role;
                    currentPlayer.identity = savedData.currentPlayer.identity;
                    currentPlayer.handCards = savedData.currentPlayer.handCards || [];
                    currentPlayer.isGod = savedData.currentPlayer.role === 'god';
                    
                    // 立即更新页面上显示的玩家信息
                    document.getElementById('playerNameDisplay').textContent = savedData.currentPlayer.name || '';
                    document.getElementById('playerIdDisplay').textContent = savedData.currentPlayer.playerId || '';
                    document.getElementById('playerIdentity').textContent = savedData.currentPlayer.identity || '';
                    
                    // 渲染手牌表格
                    renderHandCardsTable();
                    // 更新localStorage中的手牌信息
                    saveGameData();
                    
                    // 更新操作区域，确保底部按钮显示
                    updateActionSection();
                }
                // 渲染玩家信息表格
                renderPlayersInfoTable(gameState.players);
            }

            // 渲染环境牌
            renderEnvCards(gameState.envCards);
            renderEnvTable(gameState.envCards);

            // 初始化或更新行动历史表格
            initActionHistoryTable();
            updateActionHistoryTable();
            
            // 恢复按钮状态
            if (actionTaken) {
                disableActionButtons();
            } else {
                enableActionButtons();
            }
            
            // 恢复翻开按钮状态
            if (godRevealBtn) {
                const playersCount = gameState.players.filter(p => p.role === 'player').length;
                godRevealBtn.disabled = revealIndex >= playersCount;
            }
            
            // 恢复开始游戏按钮状态
            if (startGameBtn) {
                startGameBtn.style.display = 'none';
            }
            
            // 恢复技能区域显示
            if (skillSection) {
                skillSection.style.display = 'block';
            }
        } else {
            // 游戏未开始状态
            if (gameState.room) {
                // 显示玩家列表区域
                playerListSection.style.display = 'block';
                gameArea.style.display = 'none';
                joinRoomSection.style.display = 'none';
                createRoomSection.style.display = 'none';
                
                // 更新房间ID显示
                roomIdDisplay.textContent = gameState.room.id || '';
                
                // 渲染玩家列表
                renderPlayersTable(gameState.players);
                
                // 恢复开始游戏按钮状态（仅上帝可见）
                if (startGameBtn) {
                    if (currentPlayer.isGod) {
                        startGameBtn.style.display = 'block';
                        // 检查是否满员
                        const playerCount = gameState.players.filter(p => p.role === 'player').length;
                        startGameBtn.disabled = playerCount < gameState.room.playerCount;
                    } else {
                        startGameBtn.style.display = 'none';
                    }
                }
            }
        }

        // 当轮次变化时重置翻开索引和按钮状态
        if (oldRound !== data.currentRound) {
            revealIndex = 0; // 重置翻开索引
            if (godRevealBtn) {
                godRevealBtn.disabled = false; // 启用翻开按钮
            }

            // 恢复空押和押牌
            enableActionButtons();
        }
    });

    // 禁用行动按钮的函数
    function disableActionButtons() {
        emptyBetBtn.disabled = true;
        betBtn.disabled = true;
        actionTaken = true;

        // 添加禁用样式
        emptyBetBtn.classList.add('disabled-btn');
        betBtn.classList.add('disabled-btn');
    }

    // 启用行动按钮的函数
    function enableActionButtons() {
        emptyBetBtn.disabled = false;
        betBtn.disabled = false;

        // 移除禁用样式
        emptyBetBtn.classList.remove('disabled-btn');
        betBtn.classList.remove('disabled-btn');
    }

    // 初始化时禁用按钮（如果已行动）
    if (actionTaken) {
        disableActionButtons();
    } else {
        enableActionButtons();
    }

    // 添加玩家断开/重连的UI更新
    socket.on('playerDisconnected', (data) => {
        // 在玩家列表显示断开图标
        const playerRow = document.querySelector(`tr[data-uuid="${data.uuid}"]`);
        if (playerRow) {
            playerRow.classList.add('disconnected');
        }
    });

    socket.on('playerReconnected', (data) => {
        // 移除断开状态
        const playerRow = document.querySelector(`tr[data-uuid="${data.uuid}"]`);
        if (playerRow) {
            playerRow.classList.remove('disconnected');
        }
    });

    // 渲染玩家列表（房间设置阶段）
    function renderPlayersTable(players) {
        playersTableBody.innerHTML = '';
        players.sort((a, b) => a.playerId - b.playerId);

        players.forEach(player => {
            const row = document.createElement('tr');

            const idCell = document.createElement('td');
            idCell.textContent = player.playerId;

            const nameCell = document.createElement('td');
            nameCell.textContent = player.name;

            const identityCell = document.createElement('td');
            identityCell.textContent = player.identity || '未分配';

            const statusCell = document.createElement('td');
            statusCell.textContent = player.ready ? '已准备' : '等待中';

            row.appendChild(idCell);
            row.appendChild(nameCell);
            row.appendChild(identityCell);
            row.appendChild(statusCell);
            playersTableBody.appendChild(row);
        });
    }

    // 渲染环境牌
    function renderEnvCards(envCards) {
        envCards.forEach((card, index) => {
            renderEnvCard(index, card);
        });
    }

    // 渲染单张环境牌
    function renderEnvCard(index, card) {
        if (index < envCards.length) {
            const cardElement = envCards[index];

            const shouldShowFront = card.revealed &&
                (currentPlayer.isGod || ['屁者', '响屁者', '小丑'].includes(currentPlayer.identity));

            if (shouldShowFront) {
                cardElement.style.backgroundImage = `url(roles/env_${card.name}.png)`;
                cardElement.dataset.cardName = card.name;
            } else {
                cardElement.style.backgroundImage = 'url(roles/card_back_env.png)';
                cardElement.dataset.cardName = '未知';
            }

            cardElement.dataset.index = index;
            cardElement.dataset.revealed = card.revealed;

            if (currentPlayer.isGod) {
                cardElement.ondblclick = () => {
                    if (!card.revealed) {
                        socket.emit('flipCard', {
                            uuid: currentPlayer.uuid,
                            cardIndex: index
                        });
                    }
                };
            }
        }
    }

    // 渲染环境牌表格
    function renderEnvTable(envCards) {
        const envCardsRow = document.getElementById('envCardsRow');
        envCardsRow.innerHTML = '';

        const isPassenger = !currentPlayer.isGod &&
            !['屁者', '响屁者', '小丑'].includes(currentPlayer.identity);

        envCards.forEach((card, index) => {
            const cell = document.createElement('td');
            cell.id = `env-card-cell-${index}`;

            if (isPassenger) {
                // 乘客阵营：只显示已翻开的牌
                cell.textContent = card.revealed ? card.name : '???';
            } else {
                // 非乘客阵营：显示按钮（主持人可操作）
                const button = document.createElement('button');
                button.className = 'env-card-btn';
                button.textContent = card.name;
                button.dataset.index = index;

                if (currentPlayer.isGod) {
                    button.textContent = card.revealed ? card.name : '???';
                    button.addEventListener('click', () => {
                        socket.emit('revealEnvCard', {
                            uuid: currentPlayer.uuid,
                            cardIndex: index
                        });
                    });
                } else {
                    button.disabled = true;
                }

                cell.appendChild(button);
            }

            envCardsRow.appendChild(cell);
        });
    }

    // 更新环境牌表格
    function updateEnvTable(cardIndex, card) {
        const cell = document.getElementById(`env-card-cell-${cardIndex}`);
        if (!cell) return;

        const isPassenger = !currentPlayer.isGod &&
            !['屁者', '响屁者', '小丑'].includes(currentPlayer.identity);

        if (isPassenger) {
            cell.textContent = card.revealed ? card.name : '???';
        }
    }

    // 渲染玩家信息表格（游戏阶段）
    function renderPlayersInfoTable(players) {
        playersInfoBody.innerHTML = '';

        // 获取当前玩家身份
        const currentIdentity = currentPlayer.identity;

        // 判断当前玩家是否属于屁者阵营
        const isPeeCamp = ['屁者', '响屁者', '小丑'].includes(currentIdentity);

        players.filter(p => p.role === 'player')
            .sort((a, b) => a.playerId - b.playerId)
            .forEach(player => {
                const row = document.createElement('tr');

                const idCell = document.createElement('td');
                idCell.textContent = player.playerId;

                const nameCell = document.createElement('td');
                nameCell.textContent = player.name;

                const identityCell = document.createElement('td');

                // 身份列可见权限：考虑曝光状态、当前玩家身份、当前玩家查验状态、阵营关系
                let showIdentity = false;

                // 主持人总是可见
                if (currentPlayer.isGod) {
                    showIdentity = true;
                }
                // 被曝光的玩家
                else if (gameState.exposedPlayers.includes(player.uuid)) {
                    showIdentity = true;
                }
                // 玩家自己
                else if (player.uuid === currentPlayer.uuid) {
                    showIdentity = true;
                }
                // 当前玩家查验过的玩家
                else if (currentPlayer.checkedPlayers.includes(player.uuid)) {
                    showIdentity = true;
                }
                // 屁者阵营互相可见
                else if (isPeeCamp && ['屁者', '响屁者', '小丑'].includes(player.identity)) {
                    showIdentity = true;
                }

                identityCell.textContent = showIdentity ? player.identity : '未知';

                // if (gameState.exposedPlayers.includes(player.uuid) ||
                //     currentPlayer.isGod ||
                //     player.uuid === currentPlayer.uuid ||
                //     currentPlayer.checkedPlayers.includes(player.uuid)) {
                //     identityCell.textContent = player.identity;
                // } else {
                //     identityCell.textContent = '未知';
                // }

                const roleCell = document.createElement('td');
                // 角色列逻辑
                if (player.selectedCharacter) {
                    // 已选择角色，显示选择的角色
                    roleCell.textContent = player.selectedCharacter;
                } else if (player.uuid === currentPlayer.uuid) {
                    // 当前玩家未选择角色，显示两个按钮
                    const buttonContainer = document.createElement('div');
                    buttonContainer.style.display = 'flex';
                    buttonContainer.style.gap = '5px';

                    if (player.characterOptions && player.characterOptions.length >= 2) {
                        player.characterOptions.forEach(character => {
                            const button = document.createElement('button');
                            button.textContent = character;
                            button.addEventListener('click', () => {
                                socket.emit('selectCharacter', {
                                    uuid: currentPlayer.uuid,
                                    character: character
                                });
                            });
                            buttonContainer.appendChild(button);
                        });
                    } else {
                        buttonContainer.textContent = '加载中...';
                    }

                    roleCell.appendChild(buttonContainer);
                } else {
                    // 其他玩家未选择角色
                    roleCell.textContent = '未选择';
                }

                const hpCell = document.createElement('td');
                // 血量列逻辑
                const hpContainer = document.createElement('div');
                hpContainer.style.display = 'flex';
                hpContainer.style.alignItems = 'left';
                hpContainer.style.gap = '5px';

                // 减号按钮（仅自己可见）
                if (player.uuid === currentPlayer.uuid) {
                    const minusBtn = document.createElement('button');
                    minusBtn.textContent = '-';
                    minusBtn.addEventListener('click', () => {
                        if (approvalPending) return;

                        sendApprovalRequest('hpMinus');
                    });
                    hpContainer.appendChild(minusBtn);
                }

                // 血量显示
                const hpValue = document.createElement('span');
                hpValue.textContent = player.hp || '空血';
                hpValue.className = 'hp-value';
                hpContainer.appendChild(hpValue);

                // 加号按钮（仅自己可见）
                if (player.uuid === currentPlayer.uuid) {
                    const plusBtn = document.createElement('button');
                    plusBtn.textContent = '+';
                    plusBtn.addEventListener('click', () => {
                        if (approvalPending) return;

                        sendApprovalRequest('hpPlus');
                    });
                    hpContainer.appendChild(plusBtn);
                }

                hpCell.appendChild(hpContainer);

                const handCardsCell = document.createElement('td');
                // 剩余手牌列：显示手牌数量
                handCardsCell.textContent = player.handCards ? player.handCards.length : 0;
                handCardsCell.className = 'hand-card-count';

                const actionCell = document.createElement('td');
                // 主持人不需要操作列
                if (!currentPlayer.isGod) {
                    // 为普通玩家添加查验和曝光按钮
                    actionCell.innerHTML = `
                        <div style="display: flex; gap: 5px;">
                            <button class="check-btn" data-uuid="${player.uuid}">查验</button>
                            <button class="expose-btn" data-uuid="${player.uuid}">曝光</button>
                        </div>
                    `;
                }

                row.appendChild(idCell);
                row.appendChild(nameCell);
                row.appendChild(identityCell);
                row.appendChild(roleCell);
                row.appendChild(hpCell);
                row.appendChild(handCardsCell);

                // 主持人不需要操作列
                if (!currentPlayer.isGod) {
                    row.appendChild(actionCell);
                }

                playersInfoBody.appendChild(row);
            });

        // 为查验和曝光按钮添加事件监听（仅限普通玩家）
        // if (!currentPlayer.isGod) {
        //     playersInfoBody.addEventListener('click', (e) => {
        //         if (e.target.classList.contains('check-btn')) {
        //             const targetUuid = e.target.dataset.uuid;
        //             const targetName = e.target.dataset.name;
        //             // 将目标玩家添加到当前玩家的已查验列表
        //             if (!currentPlayer.checkedPlayers.includes(targetUuid)) {
        //                 currentPlayer.checkedPlayers.push(targetUuid);
        //             }

        //             // 重新渲染玩家信息表格（只影响当前玩家视图）
        //             renderPlayersInfoTable(gameState.players);

        //             // 通知服务器记录查验操作
        //             socket.emit('playerCheck', {
        //                 name: currentPlayer.name,
        //                 targetName: targetName
        //             });
        //         } else if (e.target.classList.contains('expose-btn')) {
        //             const targetUuid = e.target.dataset.uuid;
        //             const targetName = e.target.dataset.name;
        //             socket.emit('exposeIdentity', {
        //                 name: currentPlayer.name,
        //                 targetName: targetName
        //             });
        //         }
        //     });
        // }
    }

    // 接收玩家信息更新事件
    socket.on('updatePlayerInfo', (data) => {
        keepScreenAwake();
        gameState.players = data.players;
        renderPlayersInfoTable(data.players);
    });

    // 接收曝光事件
    socket.on('identityExposed', (data) => {
        keepScreenAwake();
        // 避免重复添加
        if (!gameState.exposedPlayers.includes(data.targetUuid)) {
            gameState.exposedPlayers.push(data.targetUuid);
            renderPlayersInfoTable(gameState.players);
        }
    });

    // 初始化行动历史表格 - 使用玩家昵称
    function initActionHistoryTable() {
        actionHistoryBody.innerHTML = '';

        // 获取玩家列表（排除主持人）
        const players = gameState.players
            .filter(p => p.role === 'player')
            .sort((a, b) => a.playerId - b.playerId);

        players.forEach(player => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${player.name}</td>`;

            for (let j = 0; j < 8; j++) {
                row.innerHTML += `<td>-</td>`;
            }

            actionHistoryBody.appendChild(row);
        });
    }

    // 更新行动历史表格 - 支持分阶段显示
    function updateActionHistoryTable() {
        const rows = actionHistoryBody.querySelectorAll('tr');

        // 获取玩家列表（排除主持人）
        const players = gameState.players
            .filter(p => p.role === 'player')
            .sort((a, b) => a.playerId - b.playerId);

        players.forEach((player, index) => {
            if (index < rows.length) {
                const row = rows[index];
                const cells = row.querySelectorAll('td');

                // 第一列是玩家昵称，从第二列开始是行动
                for (let i = 1; i <= 8; i++) {
                    if (i <= gameState.currentRound) {
                        // 主持人总是能看到所有玩家的行动
                        if (currentPlayer.isGod) {
                            if (player.actions && player.actions[i]) {
                                cells[i].textContent = player.actions[i].type === 'emptyBet' ?
                                    '空押' :
                                    player.actions[i].card.name;
                            } else {
                                cells[i].textContent = '-';
                            }
                        }
                        // 普通玩家只能看到自己的行动
                        else {
                            // 当前轮次（未完成）
                            if (i === gameState.currentRound) {
                                // 只显示当前玩家自己的行动
                                if (player.uuid === currentPlayer.uuid && player.actions && player.actions[i]) {
                                    cells[i].textContent = player.actions[i].type === 'emptyBet' ?
                                        '空押' :
                                        player.actions[i].card.name;
                                } else {
                                    cells[i].textContent = '-';
                                }
                            }
                            // 已完成轮次
                            else {
                                if (player.actions && player.actions[i]) {
                                    cells[i].textContent = player.actions[i].type === 'emptyBet' ?
                                        '空押' :
                                        player.actions[i].card.name;
                                } else {
                                    cells[i].textContent = '-';
                                }
                            }
                        }
                    } else {
                        cells[i].textContent = '-';
                    }
                }
            }
        });
    }
    // function updateActionHistoryTable() {
    //     const rows = actionHistoryBody.querySelectorAll('tr');

    //     // 获取玩家列表（排除主持人）
    //     const players = gameState.players
    //         .filter(p => p.role === 'player')
    //         .sort((a, b) => a.playerId - b.playerId);

    //     players.forEach((player, index) => {
    //         if (index < rows.length) {
    //             const row = rows[index];
    //             const cells = row.querySelectorAll('td');

    //             // 第一列是玩家昵称，从第二列开始是行动
    //             for (let i = 1; i <= 8; i++) {
    //                 if (i <= gameState.currentRound) {
    //                     // 当前轮次（未完成）
    //                     if (i === gameState.currentRound) {
    //                         // 只显示当前玩家自己的行动
    //                         if (player.uuid === currentPlayer.uuid && player.actions && player.actions[i]) {
    //                             cells[i].textContent = player.actions[i].type === 'emptyBet' ?
    //                                 '空押' :
    //                                 player.actions[i].card.name;
    //                         } else {
    //                             cells[i].textContent = '-';
    //                         }
    //                     }
    //                     // 已完成轮次
    //                     else {
    //                         if (player.actions && player.actions[i]) {
    //                             cells[i].textContent = player.actions[i].type === 'emptyBet' ?
    //                                 '空押' :
    //                                 player.actions[i].card.name;
    //                         } else {
    //                             cells[i].textContent = '-';
    //                         }
    //                     }
    //                 } else {
    //                     cells[i].textContent = '-';
    //                 }
    //             }
    //         }
    //     });
    // }

    // 玩家操作事件
    emptyBetBtn.addEventListener('click', () => {
        socket.emit('playerAction', {
            type: 'emptyBet',
            uuid: currentPlayer.uuid,
            round: gameState.currentRound
        });

        currentPlayer.currentAction = { type: 'emptyBet' };
        // alert('您选择了空押');

        // 清除高亮
        if (selectedCardElement) {
            selectedCardElement.classList.remove('selected');
            selectedCardElement = null;
        }

        socket.emit('requestPlayerInfoUpdate');

        // 禁用空押和押牌按钮
        disableActionButtons();
    });

    betBtn.addEventListener('click', () => {
        if (selectedCardIndex === -1) {
            alert('请先选择一张手牌');
            return;
        }

        const card = currentPlayer.handCards[selectedCardIndex];
        if (!card) {
            alert('请选择有效的手牌');
            return;
        }

        socket.emit('playerAction', {
            type: 'bet',
            uuid: currentPlayer.uuid,
            cardIndex: selectedCardIndex,
            card: card,
            round: gameState.currentRound
        });

        currentPlayer.currentAction = { type: 'bet', card: card };
        // alert(`您押出了: ${card.name}`);

        // 清除高亮
        if (selectedCardElement) {
            selectedCardElement.classList.remove('selected');
            selectedCardElement = null;
        }

        socket.emit('requestPlayerInfoUpdate');

        // 禁用空押和押牌按钮
        disableActionButtons();
    });

    drawBtn.addEventListener('click', () => {
        if (approvalPending) return;

        sendApprovalRequest('draw');
        // approvalPending = true;
        // currentActionType = 'draw';

        // // 发送请求给主持人
        // socket.emit('sendRequestToHost', {
        //     actionType: '摸牌',
        //     playerName: currentPlayer.name
        // });

        socket.emit('requestPlayerInfoUpdate');
    });

    stealBtn.addEventListener('click', () => {
        if (approvalPending) return;

        sendApprovalRequest('steal');
        // approvalPending = true;
        // currentActionType = 'steal';

        // // 发送请求给主持人
        // socket.emit('sendRequestToHost', {
        //     actionType: '抢牌',
        //     playerName: currentPlayer.name
        // });
    });

    exchangeBtn.addEventListener('click', () => {
        if (approvalPending) return;

        sendApprovalRequest('exchange');
        // approvalPending = true;
        // currentActionType = 'exchange';

        // // 发送请求给主持人
        // socket.emit('sendRequestToHost', {
        //     actionType: '换牌',
        //     playerName: currentPlayer.name
        // });
    });

    discardBtn.addEventListener('click', () => {
        if (selectedCardIndex === -1) {
            alert('请先选择一张手牌');
            return;
        }

        const card = currentPlayer.handCards[selectedCardIndex];
        if (!card) {
            alert('请选择有效的手牌');
            return;
        }

        socket.emit('playerAction', {
            type: 'discard',
            uuid: currentPlayer.uuid,
            cardIndex: selectedCardIndex
        });

        // 清除高亮
        if (selectedCardElement) {
            selectedCardElement.classList.remove('selected');
            selectedCardElement = null;
        }

        socket.emit('requestPlayerInfoUpdate');
    });

    // 翻开按钮事件
    godRevealBtn.addEventListener('click', () => {
        // 确保是主持人
        if (!currentPlayer.isGod) return;

        socket.emit('revealPlayerAction', {
            uuid: currentPlayer.uuid,
            round: gameState.currentRound
        });
    });

    // 监听玩家行动公示事件
    socket.on('playerActionRevealed', (data) => {
        // 高亮当前被翻开的玩家押牌（仅主持人）
        // if (currentPlayer.isGod) {
        // 清除之前的高亮
        if (lastHighlightedCell) {
            lastHighlightedCell.classList.remove('highlighted-cell');
        }

        // 更新行动历史表格
        const rows = actionHistoryBody.querySelectorAll('tr');

        // 找到对应玩家的行
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const playerIdCell = row.querySelector('td:first-child');

            if (playerIdCell && playerIdCell.textContent === data.playerName) {
                const cells = row.querySelectorAll('td');
                // 当前轮次对应的列（索引=轮次）
                if (cells.length > data.round) {
                    cells[data.round].textContent = data.actionText;

                    // 高亮目标单元
                    const targetCell = cells[data.round];
                    targetCell.classList.add('highlighted-cell');
                    lastHighlightedCell = targetCell;

                    // 5秒后自动移除高亮
                    setTimeout(() => {
                        targetCell.classList.remove('highlighted-cell');
                        if (lastHighlightedCell === targetCell) {
                            lastHighlightedCell = null;
                        }
                    }, 5000);
                }
            }
        }
        // }

        // 增加翻开索引
        revealIndex++;

        // 如果所有玩家都已翻开，禁用翻开按钮
        const players = gameState.players.filter(p => p.role === 'player');
        if (revealIndex >= players.length) {
            godRevealBtn.disabled = true;
        }
    });

    // 主持人下一轮按钮事件
    godNextRoundBtn.addEventListener('click', () => {
        // 检查所有玩家是否都已完成操作
        const allPlayersActed = gameState.players
            .filter(p => p.role === 'player')
            .every(p => p.actions && p.actions[gameState.currentRound]);

        socket.emit('nextRound', {
            uuid: currentPlayer.uuid
        });
    });

    // 显示玩家选择浮窗
    function showPlayerSelectionModal(actionType) {
        currentActionType = actionType;
        playerButtons.innerHTML = '';

        // 获取其他玩家
        const otherPlayers = gameState.players
            .filter(p => p.role === 'player' && p.uuid !== currentPlayer.uuid)
            .sort((a, b) => a.playerId - b.playerId);

        otherPlayers.forEach(player => {
            const button = document.createElement('button');
            button.textContent = `${player.name}`;
            button.dataset.playerId = player.playerId;
            playerButtons.appendChild(button);
        });

        playerSelectionModal.style.display = 'flex';
    }

    // 玩家选择事件
    playerButtons.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const playerId = parseInt(e.target.dataset.playerId);
            playerSelectionModal.style.display = 'none';

            if (currentActionType === 'steal') {
                socket.emit('playerAction', {
                    type: 'steal',
                    uuid: currentPlayer.uuid,
                    targetPlayerId: playerId
                });
            } else if (currentActionType === 'exchange') {
                socket.emit('playerAction', {
                    type: 'exchange',
                    uuid: currentPlayer.uuid,
                    targetPlayerId: playerId
                });
            }
            socket.emit('requestPlayerInfoUpdate');
        }
    });

    // 取消玩家选择
    cancelPlayerSelection.addEventListener('click', () => {
        playerSelectionModal.style.display = 'none';
    });

    // 添加新的监听器来处理玩家信息更新
    socket.on('forcePlayerInfoUpdate', () => {
        renderPlayersInfoTable(gameState.players);
    });

    // 技能输入实时匹配
    skillInput.addEventListener('input', () => {
        const inputText = skillInput.value.trim().toLowerCase();
        if (inputText === '') {
            skillPreview.textContent = '';
            return;
        }

        // 查找匹配的技能文本
        const matchedSkill = skillMap[inputText];
        skillPreview.textContent = matchedSkill || '';
    });

    // 公示技能
    announceSkillBtn.addEventListener('click', () => {
        const inputText = skillInput.value.trim().toLowerCase();
        if (!inputText) {
            alert('请输入技能代码');
            return;
        }

        const matchedSkill = skillMap[inputText];
        if (!matchedSkill) {
            alert('无效的技能代码');
            return;
        }

        // 清空输入框
        skillInput.value = '';

        // 发送公示请求
        socket.emit('announceSkill', {
            uuid: currentPlayer.uuid,
            playerName: currentPlayer.name,
            skillCode: inputText,
            skillText: matchedSkill
        });

        // 清空匹配到的技能介绍
        skillPreview.textContent = '';
    });

    // 接收公示技能事件
    socket.on('skillAnnounced', (data) => {
        keepScreenAwake();
        // 主持人不需要显示
        //if (currentPlayer.isGod) return;

        // 创建公示元素
        const skillElement = document.createElement('div');
        skillElement.className = 'announced-skill';
        skillElement.innerHTML = `
            <span>${data.playerName}: ${data.skillText}</span>
        `;

        // 添加到公示区域
        announcedSkills.appendChild(skillElement);

        // 滚动到底部
        announcedSkills.scrollTop = announcedSkills.scrollHeight;
    });

    // 发送消息按钮事件
    sendMessageBtn.addEventListener('click', () => {
        const message = messageInput.value.trim();
        if (!message) return;

        if (currentPlayer.isGod) {
            // 主持人发送消息给最后联系的玩家
            socket.emit('sendMessageToPlayer', {
                message: message
            });
        } else {
            // 玩家发送消息给主持人
            socket.emit('sendMessageToHost', {
                message: message
            });
        }

        messageInput.value = '';
    });

    // 接收来自主持人的消息
    socket.on('messageFromHost', (data) => {
        if (!currentPlayer.isGod) {
            messageOutput.value = data.message;
        }
    });

    // 接收来自玩家的消息
    socket.on('messageFromPlayer', (data) => {
        if (currentPlayer.isGod) {
            messageOutput.value = data.message;
        }
    });

    // 接收房间重置事件
    socket.on('roomReset', () => {
        keepScreenAwake();
        createRoomSection.style.display = 'block';
        joinRoomSection.style.display = 'none';
        playerListSection.style.display = 'none';
        gameArea.style.display = 'none';
        playersTableBody.innerHTML = '';

        currentPlayer = {
            id: null,
            uuid: null,
            name: '',
            role: '',
            identity: '',
            playerId: -1,
            hp: 0,
            isGod: false,
            handCards: [],
            currentAction: null,
            checkedPlayers: [] // 重置查验列表
        };

        alert('主持人已离开，房间已重置');
    });
    
    // 设置规则说明按钮的事件监听
    function setupRulesButton() {
        const rulesBtn = document.getElementById('rulesBtn');
        const gameBoardModal = document.getElementById('gameBoardModal');
        
        if (rulesBtn && gameBoardModal) {
            // 鼠标按下时显示浮窗
            rulesBtn.addEventListener('mousedown', function() {
                gameBoardModal.style.display = 'flex';
            });
            
            // 鼠标松开时隐藏浮窗
            rulesBtn.addEventListener('mouseup', function() {
                gameBoardModal.style.display = 'none';
            });
            
            // 鼠标离开按钮时隐藏浮窗
            rulesBtn.addEventListener('mouseleave', function() {
                gameBoardModal.style.display = 'none';
            });
            
            // 触摸开始时显示浮窗（移动端支持）
            rulesBtn.addEventListener('touchstart', function(e) {
                e.preventDefault();
                gameBoardModal.style.display = 'flex';
            });
            
            // 触摸结束时隐藏浮窗（移动端支持）
            rulesBtn.addEventListener('touchend', function(e) {
                e.preventDefault();
                gameBoardModal.style.display = 'none';
            });
        }
    }
});