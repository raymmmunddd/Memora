// controllers/tutorController.js

const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');

// AI Service - Using Google Gemini (FREE!)
const generateAIResponse = async (userMessage, conversationHistory) => {
  console.log('==================== AI TUTOR GENERATION START (GEMINI) ====================');
  console.log('User message:', userMessage);
  console.log('Conversation history length:', conversationHistory.length);
  
  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment variables');
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  
  console.log('✓ API key found');
  
  // Build conversation context for Gemini
  const systemPrompt = `You are an expert AI tutor named "Memora AI Tutor". Your role is to:
- Help students understand concepts clearly and thoroughly
- Answer questions about any academic subject
- Provide explanations with examples when helpful
- Create practice problems and quiz questions when requested
- Encourage critical thinking and learning
- Be patient, encouraging, and supportive
- Break down complex topics into digestible parts
- Use analogies and real-world examples to clarify concepts

Keep your responses concise but comprehensive. If a topic is complex, offer to explain further or provide examples.`;

  // Format conversation history for Gemini API
  const contents = [
    {
      role: 'user',
      parts: [{ text: systemPrompt }]
    },
    {
      role: 'model',
      parts: [{ text: "I understand. I'm Memora AI Tutor, and I'm here to help you learn and understand any subject. I'll provide clear explanations, examples, and support your learning journey." }]
    }
  ];

  // Add conversation history (limit to last 10 messages to avoid token limits)
  const recentHistory = conversationHistory.slice(-10);
  recentHistory.forEach(msg => {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  });

  // Add current user message
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  console.log('→ Total conversation parts:', contents.length);

  try {
    console.log('→ Calling Gemini API...');
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    console.log('API URL (without key):', apiUrl.split('?key=')[0]);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.9,
          topK: 40,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      }),
    });

    console.log('API Response status:', response.status);
    console.log('API Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error Response (raw):', errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { message: errorText };
      }
      
      console.error('❌ API Error Response (parsed):', errorData);
      throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || errorData.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('✓ API Response received');
    console.log('Response structure:', JSON.stringify(data, null, 2));
    
    // Extract text from Gemini response
    if (!data.candidates || !data.candidates[0]) {
      console.error('❌ No candidates in response:', data);
      throw new Error('No response candidates from Gemini API');
    }
    
    if (!data.candidates[0].content || !data.candidates[0].content.parts) {
      console.error('❌ Invalid content structure:', data.candidates[0]);
      throw new Error('Invalid content structure from Gemini API');
    }
    
    const aiResponse = data.candidates[0].content.parts[0].text;
    
    if (!aiResponse) {
      console.error('❌ Empty response text');
      throw new Error('Empty response from Gemini API');
    }
    
    console.log('AI response length:', aiResponse.length);
    console.log('AI response preview:', aiResponse.substring(0, 200));
    
    console.log('==================== AI TUTOR GENERATION END ====================\n');
    
    return aiResponse;
  } catch (error) {
    console.error('❌❌❌ AI TUTOR GENERATION ERROR ❌❌❌');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==========================================\n');
    throw error;
  }
};

// Generate a title for the chat session based on first message
const generateSessionTitle = (firstMessage) => {
  // Take first 50 characters or until first newline
  let title = firstMessage.substring(0, 50).split('\n')[0];
  if (firstMessage.length > 50) {
    title += '...';
  }
  return title || 'New Chat';
};

// Chat with AI Tutor
exports.chat = async (req, res) => {
  try {
    console.log('==================== CHAT REQUEST START ====================');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request headers:', req.headers);
    
    const userId = req.user?.id;
    console.log('User ID from req.user:', userId);
    
    if (!userId) {
      console.error('❌ No user ID found in request');
      return res.status(401).json({ error: 'Unauthorized: No user ID found' });
    }
    
    const { message, sessionId, conversationHistory } = req.body;

    console.log('User ID:', userId);
    console.log('Session ID:', sessionId);
    console.log('Message:', message);
    console.log('History length:', conversationHistory?.length || 0);

    if (!message || !message.trim()) {
      console.log('❌ Empty message');
      return res.status(400).json({ error: 'Message is required' });
    }

    let session;

    // If no session ID, create a new session
    if (!sessionId) {
      console.log('→ Creating new chat session...');
      
      try {
        session = await ChatSession.create({
          user_id: userId,
          title: generateSessionTitle(message),
          last_message_at: new Date(),
        });
        console.log('✓ New session created:', session._id);
      } catch (dbError) {
        console.error('❌ Database error creating session:', dbError);
        throw new Error(`Failed to create chat session: ${dbError.message}`);
      }
    } else {
      // Find existing session
      console.log('→ Finding existing session...');
      
      try {
        session = await ChatSession.findOne({
          _id: sessionId,
          user_id: userId,
          is_deleted: false,
        });

        if (!session) {
          console.log('❌ Session not found');
          return res.status(404).json({ error: 'Chat session not found' });
        }
        console.log('✓ Session found:', session._id);
      } catch (dbError) {
        console.error('❌ Database error finding session:', dbError);
        throw new Error(`Failed to find chat session: ${dbError.message}`);
      }
    }

    // Save user message to database
    console.log('→ Saving user message...');
    let userMessageDoc;
    try {
      userMessageDoc = await ChatMessage.create({
        session_id: session._id,
        user_id: userId,
        role: 'user',
        content: message,
      });
      console.log('✓ User message saved:', userMessageDoc._id);
    } catch (dbError) {
      console.error('❌ Database error saving user message:', dbError);
      throw new Error(`Failed to save user message: ${dbError.message}`);
    }

    // Generate AI response
    console.log('→ Generating AI response...');
    let aiResponse;
    try {
      aiResponse = await generateAIResponse(message, conversationHistory || []);
      console.log('✓ AI response generated');
    } catch (aiError) {
      console.error('❌ AI generation error:', aiError);
      
      // Save error message as AI response
      const errorResponse = "I apologize, but I'm having trouble generating a response right now. Please try again in a moment.";
      
      await ChatMessage.create({
        session_id: session._id,
        user_id: userId,
        role: 'assistant',
        content: errorResponse,
      });
      
      return res.status(200).json({
        sessionId: session._id,
        response: errorResponse,
        error: aiError.message,
      });
    }

    // Save AI message to database
    console.log('→ Saving AI message...');
    let aiMessageDoc;
    try {
      aiMessageDoc = await ChatMessage.create({
        session_id: session._id,
        user_id: userId,
        role: 'assistant',
        content: aiResponse,
      });
      console.log('✓ AI message saved:', aiMessageDoc._id);
    } catch (dbError) {
      console.error('❌ Database error saving AI message:', dbError);
      throw new Error(`Failed to save AI message: ${dbError.message}`);
    }

    // Update session
    try {
      session.message_count = (session.message_count || 0) + 2;
      session.last_message_at = new Date();
      await session.save();
      console.log('✓ Session updated');
    } catch (dbError) {
      console.error('❌ Database error updating session:', dbError);
      // Non-critical error, continue
    }

    console.log('==================== CHAT REQUEST END ====================\n');

    res.status(200).json({
      sessionId: session._id,
      response: aiResponse,
      messageId: aiMessageDoc._id,
    });
  } catch (error) {
    console.error('❌❌❌ CHAT ERROR ❌❌❌');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==========================================\n');
    
    res.status(500).json({ 
      error: 'Failed to process chat message',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get recent chat sessions
exports.getRecentSessions = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('==================== GET RECENT SESSIONS ====================');
    console.log('User ID:', userId);

    const sessions = await ChatSession.find({
      user_id: userId,
      is_deleted: false,
    })
      .sort({ last_message_at: -1 })
      .limit(10)
      .select('title message_count createdAt last_message_at');

    console.log('✓ Found', sessions.length, 'sessions');
    console.log('==================== END ====================\n');

    res.status(200).json({
      sessions: sessions.map(s => ({
        _id: s._id,
        title: s.title,
        messageCount: s.message_count || 0,
        createdAt: s.createdAt,
        lastMessageAt: s.last_message_at,
      })),
    });
  } catch (error) {
    console.error('❌ Get Recent Sessions Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch chat sessions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get specific chat session with messages
exports.getSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    console.log('==================== GET SESSION ====================');
    console.log('User ID:', userId);
    console.log('Session ID:', sessionId);

    const session = await ChatSession.findOne({
      _id: sessionId,
      user_id: userId,
      is_deleted: false,
    });

    if (!session) {
      console.log('❌ Session not found');
      return res.status(404).json({ error: 'Chat session not found' });
    }

    console.log('✓ Session found');

    // Get all messages for this session
    const messages = await ChatMessage.find({
      session_id: sessionId,
      is_deleted: false,
    })
      .sort({ createdAt: 1 })
      .select('role content createdAt');

    console.log('✓ Found', messages.length, 'messages');
    console.log('==================== END ====================\n');

    res.status(200).json({
      session: {
        _id: session._id,
        title: session.title,
        messageCount: session.message_count,
        createdAt: session.createdAt,
      },
      messages: messages.map(m => ({
        _id: m._id,
        role: m.role,
        content: m.content,
        timestamp: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('❌ Get Session Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch chat session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete chat session
exports.deleteSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    console.log('==================== DELETE SESSION ====================');
    console.log('User ID:', userId);
    console.log('Session ID:', sessionId);

    const session = await ChatSession.findOne({
      _id: sessionId,
      user_id: userId,
      is_deleted: false,
    });

    if (!session) {
      console.log('❌ Session not found');
      return res.status(404).json({ error: 'Chat session not found' });
    }

    // Soft delete session
    session.is_deleted = true;
    await session.save();

    // Soft delete all messages
    await ChatMessage.updateMany(
      { session_id: sessionId },
      { $set: { is_deleted: true } }
    );

    console.log('✓ Session deleted');
    console.log('==================== END ====================\n');

    res.status(200).json({ message: 'Chat session deleted successfully' });
  } catch (error) {
    console.error('❌ Delete Session Error:', error);
    res.status(500).json({ 
      error: 'Failed to delete chat session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get chat statistics for user
exports.getChatStats = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('==================== GET CHAT STATS ====================');
    console.log('User ID:', userId);

    const totalSessions = await ChatSession.countDocuments({
      user_id: userId,
      is_deleted: false,
    });

    const totalMessages = await ChatMessage.countDocuments({
      user_id: userId,
      is_deleted: false,
    });

    const recentActivity = await ChatSession.find({
      user_id: userId,
      is_deleted: false,
    })
      .sort({ last_message_at: -1 })
      .limit(1)
      .select('last_message_at');

    console.log('✓ Stats calculated');
    console.log('Total sessions:', totalSessions);
    console.log('Total messages:', totalMessages);
    console.log('==================== END ====================\n');

    res.status(200).json({
      totalSessions,
      totalMessages,
      lastActivity: recentActivity.length > 0 ? recentActivity[0].last_message_at : null,
    });
  } catch (error) {
    console.error('❌ Get Chat Stats Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch chat statistics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};