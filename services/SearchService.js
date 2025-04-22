// services/SearchService.js
const axios = require('axios');
const logger = require('../utils/logger');
const proxyUtils = require('../utils/proxyUtils');

class SearchService {
  constructor() {
    this.cache = new Map();
    this.cacheEnabled = true;
    this.confidenceThreshold = 0.5;
  }
  
  async findBestAnswer(question, options) {
    try {
      logger.info(`Searching for answer to: "${question}"`);
      
      // Check cache
      if (this.cacheEnabled && this.cache.has(question)) {
        logger.info('Using cached search results');
        return this.cache.get(question);
      }
      
      // Prepare search query
      const searchQuery = encodeURIComponent(question);
      
      // Get search results (implementation depends on available search APIs)
      const searchResults = await this.performSearch(searchQuery);
      
      if (!searchResults || searchResults.length === 0) {
        logger.warn('No search results found');
        return { index: -1, confidence: 0 };
      }
      
      // Combine all snippets for analysis
      const combinedText = searchResults.map(result => 
        `${result.title} ${result.snippet}`
      ).join(' ').toLowerCase();
      
      // Score each option based on matches in search results
      const scores = options.map((option, index) => {
        const optionText = option.toLowerCase();
        
        // Count word matches
        const wordMatches = optionText.split(/\s+/)
          .filter(word => {
            if (word.length <= 2) return false; // Ignore short words
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            return combinedText.match(regex);
          }).length;
        
        // Check for exact phrase match (higher weight)
        const exactMatch = combinedText.includes(optionText) ? 3 : 0;
        
        // Calculate score
        const score = wordMatches + exactMatch;
        const maxPossibleScore = option.split(/\s+/).length + 3;
        const normalizedScore = Math.min(score / maxPossibleScore, 1);
        
        return { index, confidence: normalizedScore };
      });
      
      // Sort by confidence
      scores.sort((a, b) => b.confidence - a.confidence);
      const bestMatch = scores[0];
      
      logger.info(`Search found answer ${bestMatch.index + 1} with confidence ${bestMatch.confidence.toFixed(2)}`);
      
      // Cache result if confidence is good
      if (this.cacheEnabled && bestMatch.confidence >= this.confidenceThreshold) {
        this.cache.set(question, bestMatch);
      }
      
      return bestMatch;
    } catch (error) {
      logger.error(`Error searching for answer: ${error.message}`);
      return { index: -1, confidence: 0 };
    }
  }
  
  async performSearch(query) {
    try {
      // This is a simplified implementation
      // In a real scenario, you would use a search API like Google, Bing, or DuckDuckGo
      logger.info(`Performing search for: "${query}"`);
      
      // Get proxy agent if configured
      const proxyConfig = proxyUtils.getProxyConfig();
      const axiosConfig = {};
      
      if (proxyConfig.host && proxyConfig.port) {
        const proxyUrl = proxyConfig.username && proxyConfig.password
          ? `http://${proxyConfig.username}:${proxyConfig.password}@${proxyConfig.host}:${proxyConfig.port}`
          : `http://${proxyConfig.host}:${proxyConfig.port}`;
        
        axiosConfig.proxy = {
          host: proxyConfig.host,
          port: proxyConfig.port,
          auth: proxyConfig.username && proxyConfig.password ? {
            username: proxyConfig.username,
            password: proxyConfig.password
          } : undefined
        };
        
        logger.info(`Using proxy for search: ${proxyConfig.host}:${proxyConfig.port}`);
      }
      
      // Use DuckDuckGo as an example (would need to be replaced with a real API)
      const searchUrl = `https://api.duckduckgo.com/?q=${query}&format=json`;
      
      const response = await axios.get(searchUrl, axiosConfig);
      
      if (response.status !== 200) {
        throw new Error(`Search failed with status: ${response.status}`);
      }
      
      const data = response.data;
      
      // Process results
      const results = [];
      
      // Add abstract if available
      if (data.AbstractText) {
        results.push({
          title: data.Heading,
          snippet: data.AbstractText,
          link: data.AbstractURL
        });
      }
      
      // Add related topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (topic.Text) {
            results.push({
              title: topic.FirstURL,
              snippet: topic.Text,
              link: topic.FirstURL
            });
          }
        }
      }
      
      logger.info(`Search found ${results.length} results`);
      return results;
    } catch (error) {
      logger.error(`Search API error: ${error.message}`);
      return [];
    }
  }
  
  clearCache() {
    this.cache.clear();
    logger.info('Search cache cleared');
  }
}

module.exports = SearchService;