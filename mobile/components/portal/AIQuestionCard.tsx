import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../../constants/Colors';
import { AIQuestion } from '../../types';

interface AIQuestionCardProps {
  question: AIQuestion;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export function AIQuestionCard({ question: q, index: i, isExpanded, onToggle }: AIQuestionCardProps) {
  return (
    <TouchableOpacity
      style={styles.questionCard}
      onPress={onToggle}
      activeOpacity={0.8}
    >
      <View style={styles.questionHeader}>
        <View style={styles.qNumber}>
          <Text style={styles.qNumberText}>{i + 1}</Text>
        </View>
        <Text style={styles.qText} numberOfLines={isExpanded ? undefined : 2}>
          {q.question}
        </Text>
        <Text style={styles.qChevron}>{isExpanded ? '▲' : '▼'}</Text>
      </View>

      {isExpanded && (
        <View style={styles.qDetails}>
          {/* MCQ Options */}
          {Array.isArray(q.options) && q.options.length > 0 && (
            <View style={styles.optionsList}>
              {q.options.map((opt, oi) => {
                const isAnswer = q.answer && opt.includes(q.answer);
                return (
                  <View
                    key={oi}
                    style={[styles.optionItem, isAnswer && styles.optionCorrect]}
                  >
                    <Text style={styles.optionLabel}>
                      {String.fromCharCode(65 + oi)}.
                    </Text>
                    <Text style={[styles.optionText, isAnswer && styles.optionCorrectText]}>
                      {opt}
                    </Text>
                    {isAnswer && <Text style={styles.correctBadge}>✓</Text>}
                  </View>
                );
              })}
            </View>
          )}

          {/* Answer */}
          {q.answer && (
            <View style={styles.answerBox}>
              <Text style={styles.answerLabel}>Answer</Text>
              <Text style={styles.answerText}>{q.answer}</Text>
            </View>
          )}

          {/* Type badge */}
          {q.type && (
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{q.type}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  questionCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  qNumber: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  qNumberText: { fontSize: 13, fontWeight: '900', color: Colors.white },
  qText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 21, fontWeight: '600' },
  qChevron: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },

  qDetails: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  optionsList: { gap: 8 },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionCorrect: {
    backgroundColor: `${Colors.success}22`,
    borderColor: Colors.success,
  },
  optionLabel: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, width: 20 },
  optionText: { flex: 1, fontSize: 13, color: Colors.text, fontWeight: '500' },
  optionCorrectText: { color: Colors.success, fontWeight: '700' },
  correctBadge: { fontSize: 14, color: Colors.success, fontWeight: '900' },

  answerBox: {
    backgroundColor: `${Colors.success}18`,
    borderRadius: 12,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: `${Colors.success}40`,
  },
  answerLabel: { fontSize: 11, fontWeight: '800', color: Colors.success, textTransform: 'uppercase', letterSpacing: 0.5 },
  answerText: { fontSize: 14, color: Colors.text, fontWeight: '600', lineHeight: 20 },

  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeBadgeText: { fontSize: 11, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
});
