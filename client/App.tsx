import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Animated,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';

const SERVER_PORT = 3001;
const API_URL = `http://78.17.111.238:${SERVER_PORT}/api`;

// Debug: log API URL at startup
console.log('[Eduti] API_URL:', API_URL);

interface Session {
  id: number;
  title: string;
  created_at: string;
}

interface Message {
  id: number;
  session_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

type Screen = 'welcome' | 'sessions' | 'chat';

const { width } = Dimensions.get('window');

// Logo component — stylized "E" with graduation cap accent
function Logo({ size = 80 }: { size?: number }) {
  return (
    <View style={[logoStyles.container, { width: size, height: size, borderRadius: size * 0.24 }]}>
      {/* Graduation cap */}
      <View style={[logoStyles.capTop, { width: size * 0.5, height: size * 0.12, top: size * 0.15 }]} />
      <View style={[logoStyles.capTassel, { top: size * 0.15, right: size * 0.22, width: size * 0.08, height: size * 0.2 }]} />
      {/* Letter E */}
      <View style={[logoStyles.letterE, { width: size * 0.38, height: size * 0.45, top: size * 0.32 }]}>
        <View style={[logoStyles.eLine, { top: 0, width: '100%' }]} />
        <View style={[logoStyles.eLine, { top: '45%', width: '70%' }]} />
        <View style={[logoStyles.eLine, { bottom: 0, width: '100%' }]} />
        <View style={[logoStyles.eVertical]} />
      </View>
    </View>
  );
}

const logoStyles = StyleSheet.create({
  container: {
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  capTop: {
    position: 'absolute',
    backgroundColor: '#fbbf24',
    borderRadius: 2,
    transform: [{ rotate: '-3deg' }],
  },
  capTassel: {
    position: 'absolute',
    backgroundColor: '#fbbf24',
    borderRadius: 2,
  },
  letterE: {
    position: 'absolute',
  },
  eLine: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#fff',
    borderRadius: 2,
    left: 0,
  },
  eVertical: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
});

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Hide Android navigation bar (immersive mode)
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
    }

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
    ]).start();

    // Pulse animation for logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const goToSessions = () => {
    setScreen('sessions');
    loadSessions();
  };

  const loadSessions = async () => {
    try {
      setError(null);
      console.log('[Eduti] Fetching:', `${API_URL}/sessions`);
      const res = await fetch(`${API_URL}/sessions`);
      console.log('[Eduti] Response status:', res.status);
      const data = await res.json();
      setSessions(data);
    } catch (e: any) {
      console.error('[Eduti] Connection error:', e.message, e);
      setError(`Не удалось подключиться к серверу.\nURL: ${API_URL}/sessions\nОшибка: ${e.message}`);
    }
  };

  const loadMessages = async (sessionId: number) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch (e) {
      console.error('Failed to load messages:', e);
    }
  };

  const openSession = (session: Session) => {
    setCurrentSession(session);
    setScreen('chat');
    loadMessages(session.id);
  };

  const createSession = async (title?: string) => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'Новый чат' }),
      });
      const session = await res.json();
      setSessions((prev) => [session, ...prev]);
      openSession(session);
    } catch (e: any) {
      setError(`Ошибка создания чата: ${e.message}`);
    }
  };

  const handleCreateChat = () => {
    setShowNewChatModal(true);
    setNewChatTitle('');
  };

  const confirmCreateChat = () => {
    setShowNewChatModal(false);
    createSession(newChatTitle.trim() || undefined);
  };

  const handleDeleteSession = (id: number, title: string) => {
    if (Platform.OS === 'web') {
      if (confirm(`Удалить чат "${title}"?`)) {
        deleteSession(id);
      }
    } else {
      Alert.alert('Удалить чат', `Удалить "${title}"?`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => deleteSession(id) },
      ]);
    }
  };

  const sendMessage = async (retryText?: string) => {
    const text = retryText || input.trim();
    if (!text || !currentSession || loading) return;

    if (!retryText) {
      setInput('');
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), session_id: currentSession.id, role: 'user', content: text, created_at: new Date().toISOString() },
      ]);
    }
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/sessions/${currentSession.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, session_id: currentSession.id, role: 'assistant', content: data.aiMessage.content, created_at: new Date().toISOString() },
      ]);
      loadSessions();
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, session_id: currentSession.id, role: 'system', content: `Ошибка: ${e.message}. Нажмите чтобы повторить.`, created_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (id: number) => {
    try {
      await fetch(`${API_URL}/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentSession?.id === id) {
        setCurrentSession(null);
        setScreen('sessions');
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  const retryLastMessage = () => {
    // Найти последнее сообщение пользователя перед ошибкой
    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1];
    if (!lastUserMsg) return;
    // Убрать сообщение об ошибке
    setMessages((prev) => prev.filter((m) => m.role !== 'system'));
    sendMessage(lastUserMsg.content);
  };

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    const isError = item.role === 'system';
    if (isError) {
      return (
        <TouchableOpacity style={styles.errorMsgRow} onPress={retryLastMessage} activeOpacity={0.7}>
          <Text style={styles.errorMsgText}>{item.content}</Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AI</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  }, [messages]);

  // ==================== WELCOME SCREEN ====================
  if (screen === 'welcome') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <Animated.View style={[styles.welcomeScreen, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          {/* Decorative circles */}
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />
          <View style={styles.decorCircle3} />

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Logo size={100} />
          </Animated.View>

          <Text style={styles.welcomeTitle}>Eduti</Text>
          <Text style={styles.welcomeTagline}>Твой персональный AI-репетитор</Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>Подготовка к ОГЭ и ЕГЭ</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={[styles.featureDot, { backgroundColor: '#4ade80' }]} />
              <Text style={styles.featureText}>Разбор заданий по шагам</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={[styles.featureDot, { backgroundColor: '#fbbf24' }]} />
              <Text style={styles.featureText}>Поиск пробелов в знаниях</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.startBtn} onPress={goToSessions} activeOpacity={0.85}>
            <Text style={styles.startBtnText}>Начать обучение</Text>
            <Text style={styles.startBtnArrow}>→</Text>
          </TouchableOpacity>

          <Text style={styles.versionText}>v1.0 beta</Text>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // ==================== SESSIONS SCREEN ====================
  if (screen === 'sessions') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.mainContent}>
          {/* Header */}
          <View style={styles.heroSection}>
            <TouchableOpacity style={styles.logoSmallWrap} onPress={() => setScreen('welcome')}>
              <Logo size={40} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.appTitle}>Мои чаты</Text>
              <Text style={styles.appSubtitle}>{sessions.length} {sessions.length === 1 ? 'диалог' : 'диалогов'}</Text>
            </View>
            <TouchableOpacity style={styles.newChatBtn} onPress={handleCreateChat} activeOpacity={0.8}>
              <Text style={styles.newChatIcon}>+</Text>
            </TouchableOpacity>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={loadSessions}>
                <Text style={styles.retryText}>Повторить</Text>
              </TouchableOpacity>
            </View>
          )}

          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Logo size={60} />
                </View>
                <Text style={styles.emptyTitle}>Пока пусто</Text>
                <Text style={styles.emptyDesc}>
                  Создай первый чат и начни подготовку к экзаменам
                </Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={handleCreateChat}>
                  <Text style={styles.emptyBtnText}>Новый чат</Text>
                </TouchableOpacity>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => openSession(item)}
                activeOpacity={0.7}
              >
                <View style={styles.cardIcon}>
                  <Text style={styles.cardIconText}>💬</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.cardDate}>
                    {new Date(item.created_at).toLocaleDateString('ru-RU', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteSession(item.id, item.title)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />

          {/* Инструкция */}
          <View style={styles.instructionBanner}>
            <Text style={styles.instructionText}>
              Пройди тест у нашей AI-модели, чтобы узнать какие пробелы в знаниях необходимо закрыть
            </Text>
          </View>
        </View>

        {/* Модалка ввода имени чата */}
        <Modal
          visible={showNewChatModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNewChatModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Новый чат</Text>
              <TextInput
                style={styles.modalInput}
                value={newChatTitle}
                onChangeText={setNewChatTitle}
                placeholder="Новый чат"
                placeholderTextColor="#666"
                autoFocus
                maxLength={100}
                onSubmitEditing={confirmCreateChat}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setShowNewChatModal(false)}
                >
                  <Text style={styles.modalBtnCancelText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalBtnConfirm}
                  onPress={confirmCreateChat}
                >
                  <Text style={styles.modalBtnConfirmText}>Создать</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ==================== CHAT SCREEN ====================
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.chatHeader}>
        <TouchableOpacity style={styles.backButton} onPress={() => { setScreen('sessions'); setCurrentSession(null); }}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.chatHeaderInfo}>
          <Text style={styles.chatHeaderTitle} numberOfLines={1}>
            {currentSession?.title}
          </Text>
          <Text style={styles.chatHeaderSub}>claude-haiku</Text>
        </View>
        <View style={styles.onlineDot} />
      </View>

      <KeyboardAvoidingView
        style={styles.chatBody}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.chatEmpty}>
              <Logo size={50} />
              <Text style={styles.chatEmptyText}>
                Привет! Задай вопрос по любому предмету — помогу разобраться.
              </Text>
            </View>
          }
          renderItem={renderMessage}
        />

        {loading && (
          <View style={styles.typingIndicator}>
            <View style={styles.typingDots}>
              <View style={[styles.dot, styles.dot1]} />
              <View style={[styles.dot, styles.dot2]} />
              <View style={[styles.dot, styles.dot3]} />
            </View>
            <Text style={styles.typingText}>AI думает...</Text>
          </View>
        )}

        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Напиши сообщение..."
              placeholderTextColor="#666"
              multiline
              maxLength={2000}
              onSubmitEditing={() => sendMessage()}
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || loading) && styles.sendButtonDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
            activeOpacity={0.7}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a16',
  },
  mainContent: {
    flex: 1,
  },

  // Welcome screen
  welcomeScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  decorCircle1: {
    position: 'absolute',
    top: '10%',
    left: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(108, 99, 255, 0.06)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: '15%',
    right: -60,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(74, 222, 128, 0.04)',
  },
  decorCircle3: {
    position: 'absolute',
    top: '35%',
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(251, 191, 36, 0.05)',
  },
  welcomeTitle: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    marginTop: 28,
    letterSpacing: -1,
  },
  welcomeTagline: {
    color: '#888',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  featureList: {
    marginTop: 40,
    gap: 14,
    width: '100%',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4F46E5',
  },
  featureText: {
    color: '#ccc',
    fontSize: 15,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 48,
    gap: 10,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  startBtnArrow: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  versionText: {
    color: '#444',
    fontSize: 12,
    marginTop: 32,
  },

  // Hero / Header
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 20,
    paddingBottom: 16,
    backgroundColor: '#0a0a16',
  },
  logoSmallWrap: {},
  appTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  appSubtitle: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
  },
  newChatBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatIcon: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '400',
  },

  // Error
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    backgroundColor: '#1f1215',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3d1a1a',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    lineHeight: 18,
  },
  retryText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },

  // Session list
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12122a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e1e3a',
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#1a1a36',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardIconText: {
    fontSize: 18,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    color: '#f0f0f0',
    fontSize: 15,
    fontWeight: '600',
  },
  cardDate: {
    color: '#555',
    fontSize: 12,
    marginTop: 3,
  },
  cardArrow: {
    color: '#444',
    fontSize: 24,
    fontWeight: '300',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#2a1520',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  deleteBtnText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '600',
  },

  // Instruction banner
  instructionBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#121230',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e1e3a',
  },
  instructionText: {
    color: '#aaa',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#161630',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#252545',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#0d0d1f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252545',
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1a1a30',
    alignItems: 'center',
  },
  modalBtnCancelText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '600',
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDesc: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Chat header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 44 : 12,
    paddingBottom: 14,
    backgroundColor: '#0d0d1f',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a30',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1a1a30',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  backArrow: {
    color: '#4F46E5',
    fontSize: 22,
    fontWeight: '600',
    marginTop: -2,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatHeaderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  chatHeaderSub: {
    color: '#555',
    fontSize: 12,
    marginTop: 1,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
  },

  // Chat body
  chatBody: {
    flex: 1,
  },
  msgList: {
    padding: 16,
    paddingBottom: 8,
  },
  chatEmpty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 16,
  },
  chatEmptyText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Messages
  msgRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  errorMsgRow: {
    backgroundColor: '#1f1215',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3d1a1a',
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  errorMsgText: {
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 2,
  },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  bubbleUser: {
    backgroundColor: '#4F46E5',
    borderBottomRightRadius: 6,
  },
  bubbleAi: {
    backgroundColor: '#161630',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#1e1e3a',
  },
  bubbleText: {
    color: '#e8e8e8',
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: '#fff',
  },

  // Typing indicator
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4F46E5',
    opacity: 0.4,
  },
  dot1: { opacity: 0.9 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.3 },
  typingText: {
    color: '#555',
    fontSize: 12,
  },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0d0d1f',
    borderTopWidth: 1,
    borderTopColor: '#1a1a30',
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#161630',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#252545',
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  textInput: {
    color: '#fff',
    fontSize: 15,
    maxHeight: 100,
    lineHeight: 20,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#1a1a30',
  },
  sendIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
});
