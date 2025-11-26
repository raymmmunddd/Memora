// controllers/tutorController.js

const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const UploadedFile = require('../models/UploadedFile');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and Word documents are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  }
});

// Content safety checker
const checkContentSafety = (text) => {
  console.log('→ Running content safety check...');
  
  // Normalize text for checking
  const normalizedText = text.toLowerCase().trim();
  
  // Check for empty or very short messages
  if (normalizedText.length < 2) {
    return { isSafe: false, reason: 'Message is too short' };
  }
  
  // Check for excessively long messages (potential spam/abuse)
  if (normalizedText.length > 5000) {
    return { isSafe: false, reason: 'Message is too long' };
  }
  
  // Explicit harmful content patterns
  const explicitPatterns = [
    // Sexual content
    /\b(sex|sexual|porn|nude|naked|explicit)\b/i,
    /\b(xxx|adult content|nsfw)\b/i,
    
    // Violence and harm
    /\b(kill|murder|suicide|self[\s-]?harm|hurt yourself)\b/i,
    /\b(bomb|weapon|attack|terrorist)\b/i,
    
    // Hate speech indicators
    /\b(hate|racist|discrimination|slur)\b/i,
    
    // Harassment
    /\b(harass|bully|threaten|stalk)\b/i,
    
    // Dangerous activities
    /\b(drug|illegal|hack|exploit|cheat)\b/i,
  ];
  
  // Check for explicit patterns
  for (const pattern of explicitPatterns) {
    if (pattern.test(normalizedText)) {
      console.log('⚠️ Content safety check FAILED - harmful pattern detected');
      return { 
        isSafe: false, 
        reason: 'Content contains potentially harmful or inappropriate material' 
      };
    }
  }
  
  // Additional checks for spam patterns
  const spamPatterns = [
    /(.)\1{10,}/, // Repeated characters (aaaaaaaaaa)
    /\b(click here|buy now|limited offer)\b/i,
    /\b(viagra|casino|lottery)\b/i,
  ];
  
  for (const pattern of spamPatterns) {
    if (pattern.test(normalizedText)) {
      console.log('⚠️ Content safety check FAILED - spam pattern detected');
      return { 
        isSafe: false, 
        reason: 'Content appears to be spam' 
      };
    }
  }
  
  console.log('✓ Content safety check PASSED');
  return { isSafe: true };
};

// Extract text from PDF
const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
};

// Extract text from Word document
const extractTextFromWord = async (filePath) => {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error('Word extraction error:', error);
    throw new Error('Failed to extract text from Word document');
  }
};

// Process uploaded file and extract text
const processUploadedFile = async (fileId) => {
  try {
    const file = await UploadedFile.findById(fileId);
    if (!file) {
      throw new Error('File not found');
    }

    let extractedText = '';

    if (file.mime_type === 'application/pdf') {
      extractedText = await extractTextFromPDF(file.file_path);
    } else if (
      file.mime_type === 'application/msword' ||
      file.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      extractedText = await extractTextFromWord(file.file_path);
    }

    // Check extracted text for harmful content
    const safetyCheck = checkContentSafety(extractedText.substring(0, 2000)); // Check first 2000 chars
    if (!safetyCheck.isSafe) {
      throw new Error('File contains inappropriate content and cannot be processed');
    }

    // Update file with extracted text
    file.extracted_text = extractedText;
    file.is_processed = true;
    await file.save();

    return extractedText;
  } catch (error) {
    console.error('File processing error:', error);
    
    // Update file with error
    const file = await UploadedFile.findById(fileId);
    if (file) {
      file.processing_error = error.message;
      file.is_processed = false;
      await file.save();
    }
    
    throw error;
  }
};

// AI Service - Using Google Gemini with file context
const generateAIResponse = async (userMessage, conversationHistory, fileContents = []) => {
  console.log('==================== AI TUTOR GENERATION START (GEMINI) ====================');
  console.log('User message:', userMessage);
  console.log('Conversation history length:', conversationHistory.length);
  console.log('File contents count:', fileContents.length);
  
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment variables');
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  
  console.log('✓ API key found');
  
  // Build conversation context for Gemini
  let systemPrompt = `You are an expert AI tutor named "Memora AI Tutor". Your role is to:
- Help students understand concepts clearly and thoroughly
- Answer questions about any academic subject
- Provide explanations with examples when helpful
- Create practice problems and quiz questions when requested
- Encourage critical thinking and learning
- Be patient, encouraging, and supportive
- Break down complex topics into digestible parts
- Use analogies and real-world examples to clarify concepts

IMPORTANT SAFETY GUIDELINES:
- You must REFUSE to engage with any requests involving sexual, explicit, violent, harmful, or illegal content
- You must NOT provide information on how to harm oneself or others
- You must NOT engage with hate speech, harassment, or discriminatory content
- You must NOT provide instructions for dangerous or illegal activities
- If asked about inappropriate topics, politely decline and redirect to educational content
- Focus ONLY on legitimate educational and academic topics`;

  // Add file context if available
  if (fileContents.length > 0) {
    systemPrompt += `\n\nThe user has provided the following documents for reference:\n\n`;
    fileContents.forEach((fileContent, index) => {
      systemPrompt += `--- Document ${index + 1}: ${fileContent.filename} ---\n${fileContent.text}\n\n`;
    });
    systemPrompt += `Please reference these documents when answering the user's questions. When you reference information from the documents, mention which document you're referring to.`;
  }

  systemPrompt += `\n\nKeep your responses concise but comprehensive. If a topic is complex, offer to explain further or provide examples.`;

  // Format conversation history for Gemini API
  const contents = [
    {
      role: 'user',
      parts: [{ text: systemPrompt }]
    },
    {
      role: 'model',
      parts: [{ text: "I understand. I'm Memora AI Tutor, and I'm here to help you learn and understand any subject. I'll provide clear explanations, examples, and support your learning journey." + (fileContents.length > 0 ? " I've reviewed the documents you've provided and will reference them as needed." : "") + " I'm committed to maintaining a safe and appropriate learning environment." }]
    }
  ];

  // Add conversation history (limit to last 10 messages)
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error Response:', errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Check if content was blocked by safety filters
    if (data.candidates && data.candidates[0]?.finishReason === 'SAFETY') {
      console.log('⚠️ Response blocked by Gemini safety filters');
      throw new Error('SAFETY_BLOCK');
    }
    
    if (!data.candidates || !data.candidates[0]?.content?.parts) {
      console.error('❌ Invalid response structure:', data);
      throw new Error('Invalid response from Gemini API');
    }
    
    const aiResponse = data.candidates[0].content.parts[0].text;
    
    if (!aiResponse) {
      throw new Error('Empty response from Gemini API');
    }
    
    console.log('AI response length:', aiResponse.length);
    console.log('==================== AI TUTOR GENERATION END ====================\n');
    
    return aiResponse;
  } catch (error) {
    console.error('❌❌❌ AI TUTOR GENERATION ERROR ❌❌❌');
    console.error('Error:', error.message);
    throw error;
  }
};

// Generate a title for the chat session
const generateSessionTitle = (firstMessage) => {
  let title = firstMessage.substring(0, 50).split('\n')[0];
  if (firstMessage.length > 50) {
    title += '...';
  }
  return title || 'New Chat';
};

// Upload file handler
exports.uploadFile = [
  upload.single('file'),
  async (req, res) => {
    try {
      console.log('==================== FILE UPLOAD START ====================');
      
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('File uploaded:', req.file.originalname);

      // Save file metadata to database
      const uploadedFile = await UploadedFile.create({
        user_id: userId,
        original_name: req.file.originalname,
        filename: req.file.filename,
        file_path: req.file.path,
        file_type: path.extname(req.file.originalname).toLowerCase(),
        file_size: req.file.size,
        mime_type: req.file.mimetype,
      });

      console.log('✓ File metadata saved:', uploadedFile._id);

      // Process file asynchronously
      processUploadedFile(uploadedFile._id).catch(err => {
        console.error('Background processing error:', err);
      });

      console.log('==================== FILE UPLOAD END ====================\n');

      res.status(200).json({
        message: 'File uploaded successfully',
        file: {
          _id: uploadedFile._id,
          original_name: uploadedFile.original_name,
          file_size: uploadedFile.file_size,
          mime_type: uploadedFile.mime_type,
          is_processed: uploadedFile.is_processed,
        },
      });
    } catch (error) {
      console.error('❌ Upload error:', error);
      res.status(500).json({ 
        error: 'Failed to upload file',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
];

// Get user's uploaded files
exports.getUserFiles = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const files = await UploadedFile.find({
      user_id: userId,
      is_deleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('original_name file_size mime_type is_processed processing_error createdAt');

    res.status(200).json({
      files: files.map(f => ({
        _id: f._id,
        original_name: f.original_name,
        file_size: f.file_size,
        mime_type: f.mime_type,
        is_processed: f.is_processed,
        processing_error: f.processing_error,
        createdAt: f.createdAt,
      })),
    });
  } catch (error) {
    console.error('❌ Get files error:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
};

// Chat with AI Tutor (with file support)
exports.chat = async (req, res) => {
  try {
    console.log('==================== CHAT REQUEST START ====================');
    
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { message, sessionId, conversationHistory, fileIds } = req.body;

    console.log('User ID:', userId);
    console.log('Session ID:', sessionId);
    console.log('Message:', message);
    console.log('File IDs:', fileIds);

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // SAFETY CHECK: Validate message content before processing
    const safetyCheck = checkContentSafety(message);
    if (!safetyCheck.isSafe) {
      console.log('⚠️ Message blocked due to safety concerns');
      
      const safetyResponse = "I'm sorry, but I cannot respond to that message. As an educational AI tutor, I'm designed to help with academic topics and learning. Please ask me about subjects like math, science, history, literature, or any other educational topic you'd like help with.";
      
      return res.status(400).json({ 
        error: 'Message contains inappropriate content',
        message: safetyResponse,
        blocked: true
      });
    }

    let session;

    // Create or find session
    if (!sessionId) {
      console.log('→ Creating new chat session...');
      session = await ChatSession.create({
        user_id: userId,
        title: generateSessionTitle(message),
        last_message_at: new Date(),
      });
      console.log('✓ New session created:', session._id);
    } else {
      session = await ChatSession.findOne({
        _id: sessionId,
        user_id: userId,
        is_deleted: false,
      });

      if (!session) {
        return res.status(404).json({ error: 'Chat session not found' });
      }
    }

    // Get file contents if file IDs provided
    let fileContents = [];
    if (fileIds && fileIds.length > 0) {
      console.log('→ Loading file contents...');
      
      const files = await UploadedFile.find({
        _id: { $in: fileIds },
        user_id: userId,
        is_deleted: false,
      });

      for (const file of files) {
        // Wait for processing if not complete
        let attempts = 0;
        while (!file.is_processed && attempts < 10) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await file.reload();
          attempts++;
        }

        if (file.extracted_text) {
          fileContents.push({
            filename: file.original_name,
            text: file.extracted_text,
          });
        }
      }

      console.log('✓ Loaded', fileContents.length, 'file contents');
    }

    // Save user message
    const userMessageDoc = await ChatMessage.create({
      session_id: session._id,
      user_id: userId,
      role: 'user',
      content: message,
    });

    // Generate AI response with file context
    let aiResponse;
    try {
      aiResponse = await generateAIResponse(
        message,
        conversationHistory || [],
        fileContents
      );
    } catch (aiError) {
      console.error('❌ AI generation error:', aiError);
      
      // Check if it was blocked by safety filters
      let errorResponse;
      if (aiError.message === 'SAFETY_BLOCK') {
        errorResponse = "I cannot provide a response to that request. As an educational AI tutor, I'm here to help with academic subjects and learning. Please feel free to ask me about any educational topic!";
        console.log('⚠️ Response blocked by Gemini safety filters');
      } else {
        errorResponse = "I apologize, but I'm having trouble generating a response right now. Please try again in a moment.";
      }
      
      await ChatMessage.create({
        session_id: session._id,
        user_id: userId,
        role: 'assistant',
        content: errorResponse,
      });
      
      return res.status(200).json({
        sessionId: session._id,
        response: errorResponse,
        blocked: aiError.message === 'SAFETY_BLOCK'
      });
    }

    // Save AI message
    const aiMessageDoc = await ChatMessage.create({
      session_id: session._id,
      user_id: userId,
      role: 'assistant',
      content: aiResponse,
    });

    // Update session
    session.message_count = (session.message_count || 0) + 2;
    session.last_message_at = new Date();
    await session.save();

    console.log('==================== CHAT REQUEST END ====================\n');

    res.status(200).json({
      sessionId: session._id,
      response: aiResponse,
      messageId: aiMessageDoc._id,
    });
  } catch (error) {
    console.error('❌ Chat error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get recent chat sessions
exports.getRecentSessions = async (req, res) => {
  try {
    const userId = req.user.id;

    const sessions = await ChatSession.find({
      user_id: userId,
      is_deleted: false,
    })
      .sort({ last_message_at: -1 })
      .limit(10)
      .select('title message_count createdAt last_message_at');

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
    res.status(500).json({ error: 'Failed to fetch chat sessions' });
  }
};

// Get specific chat session with messages
exports.getSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    const session = await ChatSession.findOne({
      _id: sessionId,
      user_id: userId,
      is_deleted: false,
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    const messages = await ChatMessage.find({
      session_id: sessionId,
      is_deleted: false,
    })
      .sort({ createdAt: 1 })
      .select('role content createdAt');

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
    res.status(500).json({ error: 'Failed to fetch chat session' });
  }
};

// Delete chat session
exports.deleteSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    const session = await ChatSession.findOne({
      _id: sessionId,
      user_id: userId,
      is_deleted: false,
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    session.is_deleted = true;
    await session.save();

    await ChatMessage.updateMany(
      { session_id: sessionId },
      { $set: { is_deleted: true } }
    );

    res.status(200).json({ message: 'Chat session deleted successfully' });
  } catch (error) {
    console.error('❌ Delete Session Error:', error);
    res.status(500).json({ error: 'Failed to delete chat session' });
  }
};

// Get chat statistics
exports.getChatStats = async (req, res) => {
  try {
    const userId = req.user.id;

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

    res.status(200).json({
      totalSessions,
      totalMessages,
      lastActivity: recentActivity.length > 0 ? recentActivity[0].last_message_at : null,
    });
  } catch (error) {
    console.error('❌ Get Chat Stats Error:', error);
    res.status(500).json({ error: 'Failed to fetch chat statistics' });
  }
};