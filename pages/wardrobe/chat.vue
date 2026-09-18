<template>
  <view class="page">
    <view class="chat-header">
      <button class="header-button" @click="openSessionDrawer">历史</button>
      <view class="chat-title">{{ currentSessionTitle }}</view>
      <button class="header-button primary" @click="startNewSession">新对话</button>
    </view>

    <scroll-view class="messages" scroll-y :scroll-top="scrollTop">
      <view class="assistant-card">
        <view class="assistant-title">AI穿搭助手</view>
        <view class="assistant-text">你可以直接说：明天朋友婚礼、18 度、想温柔一点。</view>
        <view class="tool-row">
          <view v-for="tool in toolEntries" :key="tool.key" class="tool-chip" @click="goPage(tool.pageUrl)">
            {{ tool.title }}
          </view>
        </view>
      </view>

      <view v-for="message in messages" :key="message.id" class="message" :class="message.role">
        <view class="bubble">
          <view v-if="message.thinking" class="thinking-block">
            <view class="thinking-head">
              <view class="thinking-dot"></view>
              <view class="thinking-title">{{ message.phase || '正在思考' }}</view>
            </view>
            <view class="progress-track">
              <view class="progress-bar" :style="{ width: (message.progress || 12) + '%' }"></view>
            </view>
          </view>
          <text v-else>{{ message.text }}</text>
          <text v-if="message.typing" class="typing-cursor"></text>
          <view v-if="!message.thinking && message.cards && message.cards.length" class="card-stack">
            <view v-for="card in message.cards" :key="card.type + '_' + (card.title || '')" class="agent-card">
              <view class="agent-card-title">{{ card.title }}</view>
              <view v-if="card.desc" class="agent-card-desc">{{ card.desc }}</view>

              <view v-if="card.type === 'scene_picker'" class="scene-options">
                <view v-for="option in card.options" :key="option.label" class="scene-option" @click="handleCardAction({ action: 'send_text', text: option.text })">
                  {{ option.label }}
                </view>
              </view>

              <view v-if="card.type === 'outfit_confirm' && card.items && card.items.length" class="card-items">
                <view v-for="item in card.items" :key="item._id || item.name" class="card-item">
                  <image v-if="item.image_url" class="card-item-img" :src="item.image_url" mode="aspectFill"></image>
                  <view v-else class="card-item-img empty">{{ item.category || '单品' }}</view>
                  <view class="card-item-name">{{ item.name }}</view>
                </view>
              </view>

              <view v-if="card.actions && card.actions.length" class="card-actions">
                <view v-for="action in card.actions" :key="action.label" class="card-action" @click="handleCardAction(action)">
                  {{ action.label }}
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view v-if="records.length" class="result-area">
        <view v-for="record in records" :key="record._id || record.id" class="outfit-card">
          <view class="outfit-title">{{ record.title }}</view>
          <view class="outfit-reason">{{ record.reason }}</view>
          <scroll-view class="item-scroll" scroll-x>
            <view class="item-row">
              <view v-for="item in record.outfit_items" :key="item._id" class="item">
                <image class="item-image" :src="item.image_url" mode="aspectFill"></image>
                <view class="item-name">{{ item.name }}</view>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
    </scroll-view>

    <view class="composer">
      <input class="input" v-model="inputText" confirm-type="send" placeholder="描述你的穿搭需求" @confirm="sendMessage" />
      <button class="send-button" :class="{ disabled: sending }" :disabled="sending" @click="sendMessage">
        发送
      </button>
    </view>

    <view v-if="showSessionDrawer" class="drawer-mask" @click="closeSessionDrawer">
      <view class="session-drawer" @click.stop>
        <view class="drawer-head">
          <view class="drawer-title">历史对话</view>
          <view class="drawer-close" @click="closeSessionDrawer">关闭</view>
        </view>
        <button class="new-session-button" @click="startNewSession">新建对话</button>
        <scroll-view class="session-list" scroll-y>
          <view
            v-for="session in sessions"
            :key="session._id || session.id"
            class="session-item"
            :class="{ active: currentSessionId === (session._id || session.id) }"
            @click="switchSession(session)"
          >
            <view class="session-main">
              <view class="session-title">{{ session.title || '新的搭配对话' }}</view>
              <view class="session-sub">{{ session.last_message || '还没有消息' }}</view>
            </view>
            <view class="session-delete" @click.stop="removeSession(session)">删除</view>
          </view>
          <view v-if="!sessions.length" class="empty-session">暂无历史对话</view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script>
  let vk = uni.vk;

  export default {
    data() {
      return {
        // AI Agent 学习注释：前端短期状态
        // messages 是当前页面正在展示的短期对话记录；
        // 真正持久化的短期记忆在云端 chat_messages。
        // 页面刷新后会通过 sessionDetail 重新从云端恢复 messages。
        inputText: '',
        sending: false,
        scrollTop: 0,
        // context 保存当前会话里最新的结构化需求，例如 scene/weather/temperature。
        // 它不是完整聊天记录，而是本轮 Agent 决策最需要的“压缩上下文”。
        context: {},
        records: [],
        messages: [],
        // currentSessionId / activeSession / sessions 对应“会话管理”。
        // currentSessionId 告诉后端：这条消息属于哪一个历史对话。
        // sessions 是历史对话列表，用于切换会话。
        currentSessionId: '',
        activeSession: null,
        sessions: [],
        showSessionDrawer: false,
        // AI Agent 学习注释：伪流式输出
        // 当前后端是 vk.callFunction，一次性返回结果，不是真 SSE。
        // 所以前端用 progressStages + typingTimer 做“AI 正在处理”的体验：
        // 1. 请求发出后，AI 气泡显示阶段进度；
        // 2. 后端返回后，AI 回复逐字打出来；
        // 3. 加载状态放在 AI 侧，而不是放在用户的发送按钮上。
        progressTimer: null,
        typingTimer: null,
        progressStageIndex: 0,
        progressStages: [
          { text: '理解你的穿搭需求', progress: 18 },
          { text: '读取天气和场景', progress: 36 },
          { text: '检索你的衣柜单品', progress: 58 },
          { text: '组合整套搭配', progress: 78 },
          { text: '整理推荐理由', progress: 92 },
        ],
        toolEntries: [
          {
            key: 'outfit',
            title: '生成方案',
            pageUrl: '/pages/wardrobe/outfit',
          },
          {
            key: 'tryon',
            title: 'AI试穿',
            pageUrl: '/pages/wardrobe/tryon',
          },
          {
            key: 'price',
            title: '全网比价',
            pageUrl: '/pages/wardrobe/price-search',
          },
        ],
      };
    },
    onLoad() {
      vk = uni.vk;
      this.loadSessions();
    },
    onUnload() {
      this.clearProgressTimer();
      this.clearTypingTimer();
    },
    computed: {
      currentSessionTitle() {
        if (this.activeSession && this.activeSession.title) return this.activeSession.title;
        return this.messages.length ? '当前对话' : '新的搭配对话';
      },
    },
    methods: {
      /**
       * 发送用户消息。
       * Agent 设计点：
       * 对话不是每一句都直接生成结果。服务端会判断信息是否足够：
       * 不足时主动追问；足够时复用穿搭生成链路，从真实衣柜里返回方案。
       *
       * AI Agent 学习注释：
       * 这里的前端职责不是“自己判断怎么搭配”，而是把用户输入、当前 session_id、
       * 当前结构化 context 发给后端 Agent。
       * 后端 Agent 再决定下一步：追问 / 调用 outfit.generate / 返回结果。
       */
      async sendMessage() {
        const text = this.inputText.trim();
        if (!text || this.sending) return;

        this.pushMessage('user', text);
        this.inputText = '';
        this.sending = true;
        // 用户消息已经发送，接下来等待的是 AI。
        // 所以进度气泡放在 assistant 侧，避免用户误以为“发送按钮还没发出去”。
        const assistantId = this.pushThinkingMessage();
        this.startAssistantProgress(assistantId);

        try {
          const res = await vk.callFunction({
            url: 'client/wardrobe/chat.send',
            data: {
              message: text,
              context: this.context,
              // AI Agent 学习注释：会话管理关键字段
              // 带上 currentSessionId，后端就能把这条消息写入对应 chat_sessions/chat_messages。
              // 如果为空，后端会自动创建一个新会话并返回 session_id。
              session_id: this.currentSessionId,
            },
            loading: false,
          });

          this.currentSessionId = res.session_id || this.currentSessionId;
          if (res.session) this.activeSession = res.session;
          this.context = {
            request: res.request || this.context.request || {},
          };
          this.records = res.records || [];
          this.typeAssistantReply(assistantId, res.reply || '我先记录下你的需求。', res.cards || []);
          this.loadSessions();
        } catch (err) {
          console.error('发送对话失败', err);
          this.typeAssistantReply(assistantId, '这次没能生成搭配，你可以稍后再试。');
        } finally {
          this.scrollToBottom();
        }
      },
      async loadSessions() {
        // AI Agent 学习注释：历史会话列表
        // 只读取 chat_sessions 摘要，不读取所有消息，避免历史很多时页面变慢。
        try {
          const res = await vk.callFunction({
            url: 'client/wardrobe/chat.listSessions',
            data: {},
            loading: false,
          });
          this.sessions = res.rows || [];
        } catch (err) {
          console.error('读取历史对话失败', err);
        }
      },
      openSessionDrawer() {
        this.showSessionDrawer = true;
        this.loadSessions();
      },
      closeSessionDrawer() {
        this.showSessionDrawer = false;
      },
      async startNewSession() {
        // AI Agent 学习注释：新对话 = 清空短期上下文
        // 这里不删除历史，只是把 currentSessionId 和 messages 清空。
        // 下一条用户消息会在后端创建新的 chat_session。
        this.clearProgressTimer();
        this.clearTypingTimer();
        this.currentSessionId = '';
        this.activeSession = null;
        this.context = {};
        this.records = [];
        this.messages = [];
        this.inputText = '';
        this.sending = false;
        this.showSessionDrawer = false;
        this.scrollToBottom();
      },
      async switchSession(session) {
        // AI Agent 学习注释：切换对话
        // 切换时从后端读取 chat_messages，恢复 user/assistant 消息；
        // 同时用 buildContextFromMessages 恢复最近一次结构化 request，
        // 这样继续追问时，Agent 还知道上一轮聊到的场景、天气、温度。
        const sessionId = session._id || session.id || '';
        if (!sessionId || this.sending) return;
        try {
          const res = await vk.callFunction({
            url: 'client/wardrobe/chat.sessionDetail',
            data: { session_id: sessionId },
            loading: false,
          });
          this.currentSessionId = sessionId;
          this.activeSession = res.session || session;
          this.messages = (res.messages || []).map((message, index) => ({
            id: message._id || `${message.created_at || Date.now()}_${index}`,
            role: message.role,
            text: message.text || '',
            cards: message.cards || [],
            thinking: false,
            typing: false,
            phase: '',
            progress: 0,
          }));
          const assistantMessages = (res.messages || []).filter((message) => message.role === 'assistant' && Array.isArray(message.records) && message.records.length);
          this.records = assistantMessages.length ? assistantMessages[assistantMessages.length - 1].records : [];
          this.context = this.buildContextFromMessages(res.messages || []);
          this.showSessionDrawer = false;
          this.scrollToBottom();
        } catch (err) {
          console.error('切换对话失败', err);
          uni.showToast({ title: '切换失败，请重试', icon: 'none' });
        }
      },
      async removeSession(session) {
        const sessionId = session._id || session.id || '';
        if (!sessionId) return;
        try {
          await vk.callFunction({
            url: 'client/wardrobe/chat.removeSession',
            data: { session_id: sessionId },
            loading: false,
          });
          if (this.currentSessionId === sessionId) {
            this.currentSessionId = '';
            this.activeSession = null;
            this.messages = [];
            this.records = [];
            this.context = {};
          }
          this.loadSessions();
        } catch (err) {
          console.error('删除对话失败', err);
          uni.showToast({ title: '删除失败，请重试', icon: 'none' });
        }
      },
      buildContextFromMessages(messages = []) {
        // AI Agent 学习注释：压缩上下文
        // 不把全部历史消息都塞进 context，只取最近一次结构化 request。
        // 完整短期历史由后端 getRecentChatHistory 再按 session_id 读取。
        const lastWithRequest = messages
          .slice()
          .reverse()
          .find((message) => message.request && Object.keys(message.request).length);
        return {
          request: lastWithRequest ? lastWithRequest.request : {},
        };
      },
      pushMessage(role, text) {
        const id = `${Date.now()}_${this.messages.length}`;
        this.messages.push({
          id,
          role,
          text,
          thinking: false,
          typing: false,
          phase: '',
          progress: 0,
          cards: [],
        });
        this.scrollToBottom();
        return id;
      },
      pushThinkingMessage() {
        // AI Agent 学习注释：AI 侧加载状态
        // 这个气泡不是模型真实流式返回，而是前端先展示“AI 正在做什么”。
        // 对用户来说，比发送按钮转圈更符合聊天产品习惯。
        const stage = this.progressStages[0];
        const id = `${Date.now()}_${this.messages.length}`;
        this.messages.push({
          id,
          role: 'assistant',
          text: '',
          thinking: true,
          typing: false,
          phase: stage.text,
          progress: stage.progress,
          cards: [],
        });
        this.scrollToBottom();
        return id;
      },
      startAssistantProgress(messageId) {
        this.clearProgressTimer();
        this.progressStageIndex = 0;
        this.progressTimer = setInterval(() => {
          const nextIndex = Math.min(this.progressStageIndex + 1, this.progressStages.length - 1);
          this.progressStageIndex = nextIndex;
          const stage = this.progressStages[nextIndex];
          this.updateMessage(messageId, {
            phase: stage.text,
            progress: stage.progress,
          });
          this.scrollToBottom();
        }, 1400);
      },
      typeAssistantReply(messageId, fullText, cards = []) {
        // AI Agent 学习注释：伪流式打字
        // 真流式需要 SSE/WebSocket。当前云函数是一次性返回，所以这里把完整 reply
        // 分片写入同一个 assistant 消息，模拟“逐字输出”的体验。
        // 动态工具卡片会在文字打完后显示，避免用户还没看完回复就被按钮打断。
        this.clearProgressTimer();
        this.clearTypingTimer();

        const text = fullText || '';
        this.updateMessage(messageId, {
          text: '',
          thinking: false,
          typing: true,
          phase: '',
          progress: 100,
        });

        if (!text) {
          this.updateMessage(messageId, { typing: false, cards });
          this.sending = false;
          return;
        }

        let index = 0;
        this.typingTimer = setInterval(() => {
          index += 2;
          this.updateMessage(messageId, {
            text: text.slice(0, index),
            typing: index < text.length,
          });
          this.scrollToBottom();
          if (index >= text.length) {
            this.clearTypingTimer();
            this.updateMessage(messageId, {
              text,
              typing: false,
              cards,
            });
            this.sending = false;
          }
        }, 28);
      },
      handleCardAction(action = {}) {
        // AI Agent 学习注释：动态工具卡片执行器
        // 后端只返回结构化 action，前端统一解释：
        // - send_text：把卡片选择转换成一条用户消息，继续交给 Agent 决策。
        // - go_page：跳转到已有业务工具页，例如 AI 试穿、添加衣服。
        if (this.sending) return;
        if (action.action === 'send_text' && action.text) {
          this.inputText = action.text;
          this.sendMessage();
          return;
        }
        if (action.action === 'go_page' && action.pageUrl) {
          this.goPage(action.pageUrl);
        }
      },
      updateMessage(messageId, patch = {}) {
        const index = this.messages.findIndex((message) => message.id === messageId);
        if (index < 0) return;
        this.$set(this.messages, index, {
          ...this.messages[index],
          ...patch,
        });
      },
      clearProgressTimer() {
        if (!this.progressTimer) return;
        clearInterval(this.progressTimer);
        this.progressTimer = null;
      },
      clearTypingTimer() {
        if (!this.typingTimer) return;
        clearInterval(this.typingTimer);
        this.typingTimer = null;
      },
      scrollToBottom() {
        this.$nextTick(() => {
          this.scrollTop = this.messages.length * 1000 + this.records.length * 1000;
        });
      },
      goPage(pageUrl) {
        uni.navigateTo({
          url: pageUrl,
        });
      },
    },
  };
</script>

<style lang="scss" scoped>
  .page {
    display: flex;
    height: 100vh;
    flex-direction: column;
    background: linear-gradient(180deg, #fffaf4 0%, #fffdf9 46%, #fff9f1 100%);
  }

  .chat-header {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 26rpx 24rpx 18rpx;
    background: rgba(255, 250, 244, 0.96);
  }

  .chat-title {
    min-width: 0;
    flex: 1;
    padding: 0 18rpx;
    color: var(--wardrobe-text);
    font-size: 30rpx;
    font-weight: 750;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-button {
    width: 132rpx;
    height: 64rpx;
    margin: 0;
    border: 1rpx solid var(--wardrobe-border);
    border-radius: 999rpx;
    background: var(--wardrobe-surface-solid);
    color: var(--wardrobe-primary-deep);
    font-size: 25rpx;
    line-height: 64rpx;
  }

  .header-button.primary {
    border: 0;
    background: #f1edf8;
    color: #735ea0;
    font-weight: 700;
  }

  .messages {
    flex: 1;
    min-height: 0;
    box-sizing: border-box;
    padding: 32rpx;
  }

  .assistant-card,
  .outfit-card {
    margin-bottom: 24rpx;
    padding: 28rpx;
    border: 1rpx solid var(--wardrobe-border);
    border-radius: 24rpx;
    background: var(--wardrobe-surface);
    box-shadow: var(--wardrobe-shadow);
  }

  .assistant-title,
  .outfit-title {
    color: var(--wardrobe-text);
    font-size: 32rpx;
    font-weight: 750;
    line-height: 1.35;
  }

  .assistant-text,
  .outfit-reason {
    margin-top: 10rpx;
    color: var(--wardrobe-muted);
    font-size: 26rpx;
    line-height: 1.55;
  }

  .tool-row {
    display: flex;
    flex-wrap: wrap;
    margin-top: 22rpx;
  }

  .tool-chip {
    margin-right: 14rpx;
    margin-bottom: 12rpx;
    padding: 14rpx 18rpx;
    border-radius: 999rpx;
    background: #fff3e8;
    color: var(--wardrobe-primary-deep);
    font-size: 24rpx;
    font-weight: 700;
    line-height: 1.2;
  }

  .message {
    display: flex;
    margin-bottom: 18rpx;
  }

  .message.user {
    justify-content: flex-end;
  }

  .bubble {
    max-width: 560rpx;
    box-sizing: border-box;
    padding: 20rpx 24rpx;
    border: 1rpx solid var(--wardrobe-border);
    border-radius: 22rpx;
    background: var(--wardrobe-surface-solid);
    color: var(--wardrobe-text);
    font-size: 27rpx;
    line-height: 1.5;
  }

  .user .bubble {
    border: 0;
    background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
    color: #ffffff;
    box-shadow: 0 14rpx 28rpx rgba(101, 73, 50, 0.16);
  }

  .thinking-block {
    width: 430rpx;
  }

  .thinking-head {
    display: flex;
    align-items: center;
  }

  .thinking-dot {
    width: 16rpx;
    height: 16rpx;
    margin-right: 14rpx;
    border-radius: 50%;
    background: var(--wardrobe-primary);
    animation: thinkingPulse 1.1s ease-in-out infinite;
  }

  .thinking-title {
    color: var(--wardrobe-text);
    font-size: 26rpx;
    font-weight: 650;
    line-height: 1.4;
  }

  .progress-track {
    height: 8rpx;
    margin-top: 18rpx;
    overflow: hidden;
    border-radius: 999rpx;
    background: #f1e7df;
  }

  .progress-bar {
    height: 100%;
    border-radius: 999rpx;
    background: linear-gradient(90deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
    transition: width 0.35s ease;
  }

  .typing-cursor {
    display: inline-block;
    width: 4rpx;
    height: 28rpx;
    margin-left: 4rpx;
    transform: translateY(5rpx);
    border-radius: 999rpx;
    background: var(--wardrobe-primary);
    animation: cursorBlink 0.8s step-end infinite;
  }

  .card-stack {
    margin-top: 18rpx;
  }

  .agent-card {
    width: 100%;
    box-sizing: border-box;
    margin-top: 16rpx;
    padding: 20rpx;
    border: 1rpx solid #efe5dc;
    border-radius: 18rpx;
    background: #fffaf4;
  }

  .agent-card-title {
    color: var(--wardrobe-text);
    font-size: 27rpx;
    font-weight: 760;
    line-height: 1.35;
  }

  .agent-card-desc {
    margin-top: 8rpx;
    color: var(--wardrobe-muted);
    font-size: 23rpx;
    line-height: 1.45;
  }

  .scene-options,
  .card-actions {
    display: flex;
    flex-wrap: wrap;
    margin-top: 16rpx;
  }

  .scene-option,
  .card-action {
    margin: 0 12rpx 12rpx 0;
    padding: 12rpx 18rpx;
    border-radius: 999rpx;
    background: #f1edf8;
    color: #735ea0;
    font-size: 24rpx;
    font-weight: 700;
    line-height: 1.25;
  }

  .card-actions {
    margin-bottom: -12rpx;
  }

  .card-items {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12rpx;
    margin-top: 18rpx;
  }

  .card-item {
    min-width: 0;
  }

  .card-item-img {
    width: 100%;
    height: 86rpx;
    border-radius: 12rpx;
    background: #f1e4d6;
  }

  .card-item-img.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--wardrobe-muted);
    font-size: 20rpx;
  }

  .card-item-name {
    margin-top: 6rpx;
    color: var(--wardrobe-muted);
    font-size: 20rpx;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes thinkingPulse {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.82);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes cursorBlink {
    0%,
    45% {
      opacity: 1;
    }
    46%,
    100% {
      opacity: 0;
    }
  }

  .item-scroll {
    width: 100%;
    margin-top: 18rpx;
    white-space: nowrap;
  }

  .item-row {
    display: inline-flex;
  }

  .item {
    width: 140rpx;
    margin-right: 16rpx;
  }

  .item-image {
    width: 140rpx;
    height: 140rpx;
    border-radius: 14rpx;
    background: #f1e4d6;
  }

  .item-name {
    margin-top: 8rpx;
    color: var(--wardrobe-muted);
    font-size: 22rpx;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer {
    display: flex;
    box-sizing: border-box;
    padding: 18rpx 24rpx 34rpx;
    border-top: 1rpx solid var(--wardrobe-border);
    background: rgba(255, 253, 250, 0.96);
    box-shadow: 0 -12rpx 32rpx rgba(101, 73, 50, 0.16);
  }

  .input {
    height: 78rpx;
    flex: 1;
    box-sizing: border-box;
    padding: 0 24rpx;
    border: 1rpx solid var(--wardrobe-border);
    border-radius: 999rpx;
    background: var(--wardrobe-surface-solid);
    color: var(--wardrobe-text);
    font-size: 27rpx;
  }

  .send-button {
    width: 142rpx;
    height: 78rpx;
    margin: 0 0 0 16rpx;
    border-radius: 999rpx;
    background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
    color: #ffffff;
    font-size: 27rpx;
    line-height: 78rpx;
  }

  .send-button.disabled {
    opacity: 0.72;
  }

  .drawer-mask {
    position: fixed;
    z-index: 20;
    inset: 0;
    display: flex;
    justify-content: flex-start;
    background: rgba(47, 42, 40, 0.34);
  }

  .session-drawer {
    width: 610rpx;
    height: 100%;
    box-sizing: border-box;
    padding: 34rpx 26rpx;
    background: #fffdf8;
    box-shadow: 18rpx 0 44rpx rgba(47, 42, 40, 0.18);
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .drawer-title {
    color: var(--wardrobe-text);
    font-size: 34rpx;
    font-weight: 800;
    line-height: 1.35;
  }

  .drawer-close {
    color: var(--wardrobe-muted);
    font-size: 25rpx;
  }

  .new-session-button {
    height: 76rpx;
    margin: 28rpx 0 22rpx;
    border-radius: 18rpx;
    background: linear-gradient(135deg, var(--wardrobe-primary), var(--wardrobe-primary-deep));
    color: #fff;
    font-size: 27rpx;
    line-height: 76rpx;
  }

  .session-list {
    height: calc(100vh - 176rpx);
  }

  .session-item {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    margin-bottom: 16rpx;
    padding: 22rpx;
    border: 1rpx solid var(--wardrobe-border);
    border-radius: 20rpx;
    background: var(--wardrobe-surface-solid);
  }

  .session-item.active {
    border-color: var(--wardrobe-primary);
    background: #f7f2ff;
  }

  .session-main {
    min-width: 0;
    flex: 1;
  }

  .session-title {
    color: var(--wardrobe-text);
    font-size: 28rpx;
    font-weight: 720;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-sub {
    margin-top: 8rpx;
    color: var(--wardrobe-muted);
    font-size: 23rpx;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-delete {
    flex: 0 0 auto;
    margin-left: 18rpx;
    color: #c17860;
    font-size: 24rpx;
  }

  .empty-session {
    padding: 70rpx 0;
    color: var(--wardrobe-muted);
    font-size: 26rpx;
    text-align: center;
  }
</style>
