import { useState } from 'react';
import { Alert } from 'react-native';
import { aiService, type AIQuestion } from '../services';

export function useAIQuestions() {
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [questionType, setQuestionType] = useState('MCQ');
  const [difficulty, setDifficulty] = useState('Medium');
  const [count, setCount] = useState('5');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<AIQuestion[]>([]);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      Alert.alert('Missing Topic', 'Please enter a topic to generate questions for.');
      return;
    }

    const formData = new FormData();
    formData.append('topic', topic.trim());
    formData.append('subject', subject.trim() || topic.trim());
    formData.append('question_type', questionType);
    formData.append('difficulty', difficulty);
    formData.append('count', count);

    setLoading(true);
    setQuestions([]);
    try {
      const result = await aiService.generateQuestions(formData);
      const qs: AIQuestion[] = Array.isArray(result)
        ? (result as any)
        : Array.isArray((result as any)?.questions)
        ? (result as any).questions
        : [];
      
      if (qs.length === 0) {
        Alert.alert('No Questions', 'The AI did not return any questions. Try a different topic.');
        return;
      }
      setQuestions(qs);
    } catch (e: any) {
      Alert.alert('Generation Failed', e.message || 'Could not generate questions. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return {
    topic, setTopic,
    subject, setSubject,
    questionType, setQuestionType,
    difficulty, setDifficulty,
    count, setCount,
    loading,
    questions,
    handleGenerate,
  };
}
