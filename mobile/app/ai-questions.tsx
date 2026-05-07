import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import { Button } from '../components/ui/Button';
import { Card, SectionHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/Feedback';
import { useAIQuestions } from '../hooks';
import { AIQuestionCard } from '../components/portal/AIQuestionCard';

const QUESTION_TYPES = ['MCQ', 'Short Answer', 'True/False', 'Fill in the Blanks'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

export default function AIQuestionsScreen() {
  const router = useRouter();
  const {
    topic, setTopic,
    subject, setSubject,
    questionType, setQuestionType,
    difficulty, setDifficulty,
    count, setCount,
    loading,
    questions,
    handleGenerate,
  } = useAIQuestions();

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹ Back</Text>
            </TouchableOpacity>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>✨ AI Powered</Text>
            </View>
          </View>
          <Text style={styles.title}>Question Generator</Text>
          <Text style={styles.subtitle}>
            Generate practice questions on any topic using our AI engine
          </Text>

          {/* Config Form */}
          <Card style={styles.formCard}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Topic *</Text>
              <TextInput
                style={styles.textInput}
                value={topic}
                onChangeText={setTopic}
                placeholder="e.g. Photosynthesis, Algebra, World War II"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Subject (optional)</Text>
              <TextInput
                style={styles.textInput}
                value={subject}
                onChangeText={setSubject}
                placeholder="e.g. Biology, Mathematics, History"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Question Type */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Question Type</Text>
              <View style={styles.chipRow}>
                {QUESTION_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, questionType === t && styles.chipActive]}
                    onPress={() => setQuestionType(t)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, questionType === t && styles.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Difficulty */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Difficulty</Text>
              <View style={styles.chipRow}>
                {DIFFICULTIES.map((d) => {
                  const color = d === 'Easy' ? Colors.success : d === 'Hard' ? Colors.danger : Colors.warning;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.chip,
                        difficulty === d && { backgroundColor: color, borderColor: color },
                      ]}
                      onPress={() => setDifficulty(d)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, difficulty === d && styles.chipTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Count */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Number of Questions</Text>
              <View style={styles.countRow}>
                {['3', '5', '10', '15'].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.countBtn, count === n && styles.countBtnActive]}
                    onPress={() => setCount(n)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.countBtnText, count === n && styles.countBtnTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Button
              label={loading ? 'Generating...' : `Generate ${count} Questions`}
              onPress={handleGenerate}
              loading={loading}
              size="lg"
            />
          </Card>

          {/* Generated Questions */}
          {questions.length > 0 && (
            <View>
              <SectionHeader
                title="Generated Questions"
                subtitle={`${questions.length} questions on "${topic}"`}
              />
              {questions.map((q, i) => (
                <AIQuestionCard
                  key={i}
                  question={q}
                  index={i}
                  isExpanded={expandedIndex === i}
                  onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
                />
              ))}
            </View>
          )}

          {!loading && questions.length === 0 && (
            <EmptyState
              icon={<Text style={{ fontSize: 40 }}>🤖</Text>}
              title="Ready to generate"
              subtitle="Fill in the form above and tap Generate to get AI-crafted questions"
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 20, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { paddingVertical: 4 },
  backBtnText: { fontSize: 17, color: Colors.primary, fontWeight: '700' },
  headerBadge: {
    backgroundColor: `${Colors.secondary}22`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${Colors.secondary}44`,
  },
  headerBadgeText: { fontSize: 12, fontWeight: '800', color: Colors.secondary },

  title: { fontSize: 28, fontWeight: '900', color: Colors.text, letterSpacing: -0.8, marginTop: -4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, fontWeight: '500', marginTop: -8 },

  formCard: { gap: 20 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.2 },
  textInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white, fontWeight: '800' },

  countRow: { flexDirection: 'row', gap: 10 },
  countBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  countBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  countBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  countBtnTextActive: { color: Colors.white },
});
