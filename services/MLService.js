// services/MLService.js
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class MLService {
  constructor() {
    this.model = null;
    this.wordIndex = null;
    this.initialized = false;
    this.confidenceThreshold = parseFloat(process.env.ML_CONFIDENCE_THRESHOLD) || 0.6;
    this.maxSequenceLength = 50;
    
    this.init();
  }
  
  async init() {
    try {
      logger.info('Initializing ML Service...');
      
      // Load TensorFlow model
      this.model = await tf.loadLayersModel(`file://${path.join(__dirname, '../ml/model.json')}`);
      
      // Load word index
      const wordIndexPath = path.join(__dirname, '../ml/word_index.json');
      const wordIndexData = await fs.readFile(wordIndexPath, 'utf8');
      this.wordIndex = JSON.parse(wordIndexData);
      
      this.initialized = true;
      logger.info('ML Service initialized successfully');
      
      return true;
    } catch (error) {
      logger.error(`Error initializing ML Service: ${error.message}`);
      return false;
    }
  }
  
  async analyzeQuestion(question, options) {
    if (!this.initialized) {
      await this.init();
      
      if (!this.initialized) {
        logger.warn('ML Service not initialized, falling back to random selection');
        return { index: -1, confidence: 0 };
      }
    }
    
    try {
      logger.info(`Analyzing question: "${question}"`);
      
      // Tokenize and pad question
      const tokenizedQuestion = this.tokenizeText(question);
      const paddedQuestion = this.padSequence(tokenizedQuestion, this.maxSequenceLength);
      
      // Convert to tensor
      const questionTensor = tf.tensor2d([paddedQuestion]);
      
      // Get predictions
      const predictions = this.model.predict(questionTensor);
      const confidenceScores = await predictions.data();
      
      // Calculate confidence for each option
      const optionScores = options.map((_, index) => ({
        index,
        confidence: confidenceScores[index % confidenceScores.length]
      }));
      
      // Sort by confidence
      optionScores.sort((a, b) => b.confidence - a.confidence);
      
      // Check if best match exceeds confidence threshold
      const bestMatch = optionScores[0];
      
      logger.info(`ML analysis result: option ${bestMatch.index + 1} with confidence ${bestMatch.confidence.toFixed(2)}`);
      
      // Clean up tensors
      questionTensor.dispose();
      predictions.dispose();
      
      // Return best match if confident enough
      if (bestMatch.confidence >= this.confidenceThreshold) {
        return bestMatch;
      } else {
        logger.info(`Confidence below threshold (${this.confidenceThreshold}), rejecting prediction`);
        return { index: -1, confidence: 0 };
      }
    } catch (error) {
      logger.error(`Error analyzing question: ${error.message}`);
      return { index: -1, confidence: 0 };
    }
  }
  
  tokenizeText(text) {
    if (!this.wordIndex || !this.wordIndex.words) return [];
    
    // Normalize text
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const words = normalized.split(/\s+/);
    
    // Convert words to tokens
    return words.map(word => {
      return this.wordIndex.words[word] || 1; // 1 for unknown words (UNK token)
    });
  }
  
  padSequence(sequence, maxLen) {
    if (sequence.length > maxLen) {
      return sequence.slice(0, maxLen);
    }
    
    // Pad with zeros
    return [...sequence, ...Array(maxLen - sequence.length).fill(0)];
  }
  
  async simpleKeywordMatching(question, options) {
    try {
      logger.info('Using simple keyword matching as fallback');
      
      // Normalize question
      const questionWords = question.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 3);
      
      // Score each option
      const scores = options.map((option, index) => {
        const optionWords = option.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(word => word.length > 3);
        
        // Count common words
        const commonWords = optionWords.filter(word => questionWords.includes(word)).length;
        
        // Normalized score
        const score = commonWords / (optionWords.length || 1);
        
        return { index, confidence: score };
      });
      
      // Sort by score
      scores.sort((a, b) => b.confidence - a.confidence);
      
      logger.info(`Keyword matching result: option ${scores[0].index + 1} with score ${scores[0].confidence.toFixed(2)}`);
      
      return scores[0];
    } catch (error) {
      logger.error(`Error in keyword matching: ${error.message}`);
      
      // Return random option as last resort
      const randomIndex = Math.floor(Math.random() * options.length);
      return { index: randomIndex, confidence: 0.1 };
    }
  }
}

module.exports = MLService;