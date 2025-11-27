// controllers/quizController.js

const Quiz = require('../models/Quiz');
const UploadedFile = require('../models/UploadedFile');
const QuizAttempt = require('../models/QuizAttempt');
const fs = require('fs').promises;
const path = require('path');

const extractTextFromPDF = async (filePath) => {
  console.log('→ Starting PDF extraction for:', filePath);
  
  try {
    const pdf = require('pdf-parse');
    const dataBuffer = await fs.readFile(filePath);
    
    console.log('→ PDF buffer read, size:', dataBuffer.length);
    
    const options = {
      max: 0,
    };
    
    const data = await pdf(dataBuffer, options);
    
    console.log('✓ PDF parsed successfully');
    console.log('→ Pages:', data.numpages);
    console.log('→ Text length:', data.text.length);
    
    if (!data.text || data.text.trim().length === 0) {
      console.warn('⚠️ PDF parsed but no text found - might be image-based or scanned');
      throw new Error('PDF contains no extractable text. This might be a scanned document or image-based PDF.');
    }
    
    console.log('→ First 500 chars:', data.text.substring(0, 500));
    
    return data.text;
    
  } catch (error) {
    console.error('❌ PDF extraction failed:', error.message);
    
    if (error.message.includes('Invalid PDF')) {
      throw new Error('Invalid or corrupted PDF file');
    } else if (error.message.includes('encrypted')) {
      throw new Error('PDF is password-protected and cannot be read');
    } else if (error.message.includes('no extractable text')) {
      throw error; 
    } else {
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }
};

// Alternative PDF extraction using pdf2json (fallback)
const extractTextFromPDFAlternative = async (filePath) => {
  const PDFParser = require('pdf2json');
  
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    
    pdfParser.on('pdfParser_dataError', (errData) => {
      console.error('❌ PDF2JSON Error:', errData.parserError);
      reject(new Error(`Failed to parse PDF: ${errData.parserError}`));
    });
    
    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      try {
        const text = pdfData.Pages.map(page => {
          return page.Texts.map(textItem => {
            return textItem.R.map(r => decodeURIComponent(r.T)).join(' ');
          }).join(' ');
        }).join('\n\n');
        
        if (!text || text.trim().length === 0) {
          reject(new Error('PDF contains no extractable text'));
        } else {
          console.log('✓ PDF2JSON extraction successful, length:', text.length);
          resolve(text);
        }
      } catch (error) {
        reject(new Error(`Failed to process PDF data: ${error.message}`));
      }
    });
    
    pdfParser.loadPDF(filePath);
  });
};

// OCR extraction for scanned/image-based PDFs using pure JavaScript
const extractTextFromPDFWithOCR = async (filePath) => {
  console.log('→ Starting OCR extraction...');
  
  try {
    const { createWorker } = require('tesseract.js');
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    const { createCanvas } = require('canvas');
    
    const dataBuffer = await fs.readFile(filePath);
    const uint8Array = new Uint8Array(dataBuffer);
    
    console.log('→ Loading PDF document...');
    
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
    });
    
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    
    console.log(`→ Found ${numPages} pages to OCR`);
    
    const worker = await createWorker('eng');
    
    let allText = '';
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      console.log(`→ OCR processing page ${pageNum}/${numPages}...`);
      
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); 
      
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;
      
      const imageBuffer = canvas.toBuffer('image/png');
      
      const { data: { text } } = await worker.recognize(imageBuffer);
      allText += text + '\n\n';
      
      page.cleanup();
    }
    
    await worker.terminate();
    
    console.log('✓ OCR extraction successful, length:', allText.length);
    
    if (!allText || allText.trim().length < 50) {
      throw new Error('OCR extracted very little text - PDF might be blank or unreadable');
    }
    
    return allText;
    
  } catch (error) {
    console.error('❌ OCR extraction failed:', error.message);
    throw new Error(`OCR extraction failed: ${error.message}`);
  }
};

const generateQuizWithAI = async (extractedTexts, settings) => {
  const combinedText = extractedTexts.join('\n\n---\n\n');
  
  console.log('==================== AI GENERATION START (GEMINI) ====================');
  console.log('Combined text length:', combinedText.length);
  console.log('Settings:', settings);
  
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  
  const maxLength = 30000;
  const truncatedText = combinedText.length > maxLength 
    ? combinedText.substring(0, maxLength) + '\n\n[Text truncated due to length...]'
    : combinedText;
  
  // Handle multiple quiz types with backward compatibility
  const quizTypes = Array.isArray(settings.quiz_types) 
    ? settings.quiz_types 
    : (settings.quiz_type ? [settings.quiz_type] : ['multiple-choice']); // Fallback
  
  const totalQuestions = parseInt(settings.numQuestions);
  
  // Generate type-specific instructions
  const typeInstructions = quizTypes.map(type => {
    if (type === 'multiple-choice') {
      return `- Multiple Choice questions with 4 options each, where correct_answer must match one option exactly`;
    } else if (type === 'fill-blank') {
      return `- Identification/Fill-in-the-blank questions with empty options array []`;
    }
    return '';
  }).join('\n');
  
  // Build prompt based on number of types
  let typeDescription = '';
  if (quizTypes.length === 1) {
    typeDescription = `all ${quizTypes[0]} questions`;
  } else {
    typeDescription = `a mix of ${quizTypes.join(' and ')} questions`;
  }
  
  const prompt = `You are an expert educational quiz generator. Generate ${totalQuestions} questions with ${settings.difficulty} difficulty based on the following study materials.

STUDY MATERIALS:
${truncatedText}

Generate ${typeDescription} totaling ${totalQuestions} questions. The questions should include:
${typeInstructions}

Each question must have:
- question_text: the question
- question_type: either "${quizTypes.join('" or "')}"
- options: array of 4 choices for multiple-choice, empty array [] for fill-blank
- correct_answer: the correct answer (must match one option exactly for multiple-choice)
- explanation: brief explanation of the answer

Example format:
[
  {
    "question_text": "What is the capital of France?",
    "question_type": "multiple-choice",
    "options": ["Paris", "London", "Berlin", "Madrid"],
    "correct_answer": "Paris",
    "explanation": "Paris is the capital and largest city of France."
  },
  {
    "question_text": "The process by which plants make food is called ____.",
    "question_type": "fill-blank",
    "options": [],
    "correct_answer": "photosynthesis",
    "explanation": "Photosynthesis is the process where plants convert light energy into chemical energy."
  }
]`;

  try {
    console.log('→ Calling Gemini API...');
    console.log('→ Quiz types:', quizTypes);
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 65536,
            topP: 0.8,
            topK: 40,
            responseMimeType: "application/json",
          }
        }),
      }
    );

    console.log('API Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ API Error Response:', errorData);
      throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('✓ API Response received');
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ Unexpected API response structure:', data);
      throw new Error('Invalid response structure from Gemini API');
    }
    
    let textContent = data.candidates[0].content.parts[0].text;
    console.log('Raw AI response length:', textContent.length);

    let questions;
    
    try {
      questions = JSON.parse(textContent);
      console.log('✓ Direct JSON parse successful');
    } catch (parseError) {
      console.log('Direct parse failed, attempting cleanup...');
      
      textContent = textContent.trim();
      textContent = textContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
      
      const firstBracket = textContent.indexOf('[');
      const lastBracket = textContent.lastIndexOf(']');
      
      if (firstBracket === -1 || lastBracket === -1) {
        console.error('❌ No JSON array found in response');
        throw new Error('AI response does not contain a JSON array');
      }
      
      textContent = textContent.substring(firstBracket, lastBracket + 1);
      textContent = textContent.replace(/[""]/g, '"').replace(/['']/g, "'");
      textContent = textContent.replace(/,(\s*[}\]])/g, '$1');
      
      questions = JSON.parse(textContent);
      console.log('✓ JSON parse successful after cleanup');
    }

    if (!Array.isArray(questions)) {
      throw new Error(`Generated response is not an array. Got: ${typeof questions}`);
    }
    
    if (questions.length === 0) {
      throw new Error('Generated questions array is empty');
    }

    console.log('Raw questions count:', questions.length);

    // Validate questions against selected types
    const validQuestions = questions.filter(q => {
      const hasQuestionText = q && q.question_text && typeof q.question_text === 'string';
      const hasQuestionType = q && q.question_type && quizTypes.includes(q.question_type);
      const hasCorrectAnswer = q && q.correct_answer;
      const hasValidOptions = q.question_type !== 'multiple-choice' || (Array.isArray(q.options) && q.options.length >= 2);
      
      if (!hasQuestionText || !hasQuestionType || !hasCorrectAnswer || !hasValidOptions) {
        console.log('Invalid question filtered out:', JSON.stringify(q));
      }
      
      return hasQuestionText && hasQuestionType && hasCorrectAnswer && hasValidOptions;
    });

    console.log('Valid questions count:', validQuestions.length);

    if (validQuestions.length === 0) {
      console.error('❌ No valid questions found after filtering');
      throw new Error('No valid questions found in AI response');
    }

    if (validQuestions.length < totalQuestions * 0.5) {
      console.error(`❌ Only ${validQuestions.length} valid questions out of ${totalQuestions} requested`);
      throw new Error(`Only generated ${validQuestions.length} valid questions out of ${totalQuestions} requested`);
    }

    console.log('✓ Parsed', validQuestions.length, 'valid questions');
    console.log('Question type distribution:');
    quizTypes.forEach(type => {
      const count = validQuestions.filter(q => q.question_type === type).length;
      console.log(`  - ${type}: ${count} questions`);
    });
    console.log('==================== AI GENERATION END ====================\n');

    return validQuestions.slice(0, totalQuestions);
  } catch (error) {
    console.error('❌❌❌ AI GENERATION ERROR ❌❌❌');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==========================================\n');
    throw new Error(`Failed to generate quiz with AI: ${error.message}`);
  }
};

// Upload files and extract text
exports.uploadFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const files = req.files;

    console.log('==================== UPLOAD START ====================');
    console.log('User ID:', userId);
    console.log('Files received:', files ? files.length : 0);
    
    if (!files || files.length === 0) {
      console.log('❌ No files in request');
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = [];

    for (const file of files) {
      console.log('\n--- Processing file:', file.originalname);
      console.log('MIME type:', file.mimetype);
      console.log('Size:', file.size);
      console.log('Path:', file.path);
      
      let extractedText = '';
      let processingError = null;
      
      try {
        if (file.mimetype === 'text/plain') {
          console.log('→ Extracting text from TXT...');
          extractedText = await fs.readFile(file.path, 'utf-8');
          console.log('✓ TXT extraction successful, length:', extractedText.length);
        } else if (file.mimetype === 'application/pdf') {
          console.log('→ Extracting text from PDF...');
          try {
            extractedText = await extractTextFromPDF(file.path);
            console.log('✓ PDF extraction successful (pdf-parse)');
          } catch (pdfError) {
            console.error('❌ pdf-parse failed:', pdfError.message);
            console.log('→ Trying alternative method (pdf2json)...');
            
            try {
              extractedText = await extractTextFromPDFAlternative(file.path);
              console.log('✓ PDF extraction successful (pdf2json)');
            } catch (altError) {
              console.error('❌ pdf2json also failed:', altError.message);
              console.log('→ Trying OCR extraction (last resort)...');
              
              try {
                extractedText = await extractTextFromPDFWithOCR(file.path);
                console.log('✓ PDF extraction successful (OCR)');
              } catch (ocrError) {
                console.error('❌ OCR also failed:', ocrError.message);
                processingError = `All PDF extraction methods failed. Original error: ${pdfError.message}`;
                extractedText = null;
              }
            }
          }
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          console.log('→ Extracting text from DOCX...');
          try {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ path: file.path });
            extractedText = result.value;
            
            console.log('✓ DOCX extraction successful, length:', extractedText.length);
            console.log('First 200 chars:', extractedText.substring(0, 200));
          } catch (docxError) {
            console.error('❌ DOCX parsing failed:', docxError.message);
            console.error('DOCX Error stack:', docxError.stack);
            processingError = docxError.message;
          }
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
          console.log('→ PPTX files not yet supported for text extraction');
          processingError = 'PPTX file type not yet supported';
        } else {
          console.log('→ Unsupported file type for text extraction');
          processingError = 'Unsupported file type';
        }
      } catch (extractError) {
        console.error('❌ Text extraction error:', extractError.message);
        processingError = extractError.message;
      }

      console.log('→ Saving to database...');
      console.log('→ Extracted text length:', extractedText ? extractedText.length : 0);
      console.log('→ Processing error:', processingError);
      
      try {
        const fileData = {
          user_id: userId,
          original_name: file.originalname,
          filename: file.filename,
          file_path: file.path,
          file_type: path.extname(file.originalname),
          file_size: file.size,
          mime_type: file.mimetype,
          extracted_text: extractedText || null,
          is_processed: !!extractedText,
          processing_error: processingError,
        };
        
        console.log('File data to save (text preview):', {
          ...fileData,
          extracted_text: fileData.extracted_text ? 
            `${fileData.extracted_text.substring(0, 200)}... [${fileData.extracted_text.length} chars total]` : 
            null
        });
        
        const uploadedFile = await UploadedFile.create(fileData);
        console.log('✓ Database save successful, ID:', uploadedFile._id);
        
        uploadedFiles.push(uploadedFile);
      } catch (dbError) {
        console.error('❌ Database save failed:', dbError.message);
        console.error('DB Error details:', dbError);
        throw dbError;
      }
    }

    console.log('\n✓ Upload complete:', uploadedFiles.length, 'files');
    console.log('==================== UPLOAD END ====================\n');
    
    res.status(200).json({
      message: 'Files uploaded successfully',
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('\n❌❌❌ UPLOAD ERROR ❌❌❌');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==========================================\n');
    
    res.status(500).json({ 
      error: 'Failed to upload files',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Generate quiz
exports.generateQuiz = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileIds, quizTypes, numQuestions, difficulty, timeLimit } = req.body;

    console.log('==================== QUIZ GENERATION START ====================');
    console.log('User ID:', userId);
    console.log('File IDs:', fileIds);
    console.log('Settings:', { quizTypes, numQuestions, difficulty, timeLimit });

    if (!fileIds || fileIds.length === 0) {
      return res.status(400).json({ error: 'No files selected' });
    }

    // Add validation for quizTypes
    if (!quizTypes || quizTypes.length === 0) {
      return res.status(400).json({ error: 'No quiz types selected' });
    }

    const files = await UploadedFile.find({
      _id: { $in: fileIds },
      user_id: userId,
      is_deleted: false,
    });

    console.log('Found', files.length, 'files');

    if (files.length === 0) {
      return res.status(404).json({ error: 'No valid files found' });
    }

    const extractedTexts = files.map((f) => f.extracted_text).filter(Boolean);
    
    if (extractedTexts.length === 0) {
      console.error('❌ No extracted text found in files');
      return res.status(400).json({ 
        error: 'No text content found in uploaded files. Please upload files with text content.' 
      });
    }

    console.log('Total extracted text length:', extractedTexts.join('').length);

    // Generate quiz title from file names
    let quizTitle;
    if (files.length === 1) {
      // Single file: use the file name without extension
      const fileName = files[0].original_name;
      const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
      quizTitle = nameWithoutExt;
    } else {
      // Multiple files: combine first file name with count
      const firstName = files[0].original_name;
      const nameWithoutExt = firstName.substring(0, firstName.lastIndexOf('.')) || firstName;
      quizTitle = `${nameWithoutExt} +${files.length - 1} more`;
    }

    console.log('Generated quiz title:', quizTitle);

    const quiz = await Quiz.create({
      user_id: userId,
      title: quizTitle, // Use generated title instead of date
      quiz_type: Array.isArray(quizTypes) ? quizTypes : [quizTypes],
      difficulty: difficulty,
      time_limit: timeLimit === 'none' ? null : parseInt(timeLimit),
      source_files: files.map((f) => ({
        filename: f.filename,
        original_name: f.original_name,
        file_path: f.file_path,
      })),
      status: 'generating',
    });

    console.log('✓ Quiz record created, ID:', quiz._id);
    console.log('✓ Quiz title:', quiz.title);

    const settings = {
      quiz_types: Array.isArray(quizTypes) ? quizTypes : [quizTypes],
      numQuestions: numQuestions,
      difficulty: difficulty,
    };

    generateQuizWithAI(extractedTexts, settings)
      .then(async (questions) => {
        console.log('→ Updating quiz with generated questions...');
        quiz.questions = questions;
        quiz.status = 'completed';
        await quiz.save();
        console.log('✓ Quiz generation complete:', quiz._id);
      })
      .catch(async (error) => {
        console.error('❌ Quiz generation failed:', error.message);
        quiz.status = 'failed';
        quiz.generation_error = error.message;
        await quiz.save();
      });

    console.log('==================== QUIZ GENERATION INITIATED ====================\n');

    res.status(202).json({
      message: 'Quiz generation started',
      quizId: quiz._id,
      status: 'generating',
      title: quizTitle, // Include title in response
    });
  } catch (error) {
    console.error('❌❌❌ GENERATE QUIZ ERROR ❌❌❌');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==========================================\n');
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
};

exports.getQuizStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { quizId } = req.params;

    const quiz = await Quiz.findOne({
      _id: quizId,
      user_id: userId,
      is_deleted: false,
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    res.status(200).json({
      quizId: quiz._id,
      status: quiz.status,
      error: quiz.generation_error,
    });
  } catch (error) {
    console.error('Get Quiz Status Error:', error);
    res.status(500).json({ error: 'Failed to get quiz status' });
  }
};

exports.getUserQuizzes = async (req, res) => {
  try {
    const userId = req.user.id;

    const quizzes = await Quiz.find({
      user_id: userId,
      is_deleted: false,
      status: 'completed',
    })
      .sort({ createdAt: -1 });

    console.log('Found quizzes:', quizzes.length);

    // Get question counts from the most recent attempt for each quiz
    const quizIds = quizzes.map(q => q._id);
    const attempts = await QuizAttempt.find({
      quiz_id: { $in: quizIds },
      user_id: userId,
      is_deleted: false
    })
      .select('quiz_id total_questions')
      .sort({ createdAt: -1 });

    // Create a map of quiz_id -> total_questions
    const questionCountMap = {};
    attempts.forEach(attempt => {
      const quizId = attempt.quiz_id.toString();
      if (!questionCountMap[quizId]) {
        questionCountMap[quizId] = attempt.total_questions;
      }
    });

    // Format response with question count
    const quizzesWithCount = quizzes.map(quiz => {
      const quizId = quiz._id.toString();
      const questionCount = questionCountMap[quizId] || quiz.questions?.length || 0;
      
      return {
        _id: quiz._id,
        title: quiz.title,
        difficulty: quiz.difficulty,
        quiz_type: quiz.quiz_type,
        time_limit: quiz.time_limit,
        created_at: quiz.createdAt,
        question_count: questionCount,
        status: quiz.status
      };
    });

    res.status(200).json({ quizzes: quizzesWithCount });
  } catch (error) {
    console.error('Get User Quizzes Error:', error);
    res.status(500).json({ error: 'Failed to fetch quizzes' });
  }
};

exports.getQuiz = async (req, res) => {
  try {
    const userId = req.user.id;
    const { quizId } = req.params;

    const quiz = await Quiz.findOne({
      _id: quizId,
      user_id: userId,
      is_deleted: false,
      status: 'completed',
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    res.status(200).json({ quiz });
  } catch (error) {
    console.error('Get Quiz Error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz' });
  }
};

exports.submitQuizAttempt = async (req, res) => {
  try {
    const userId = req.user.id;
    const { quizId } = req.params;
    const { answers, startedAt, completedAt, forcedByTimer } = req.body;

    console.log('==================== SUBMIT QUIZ ATTEMPT ====================');
    console.log('User ID:', userId);
    console.log('Quiz ID:', quizId);
    console.log('Answers received:', answers ? answers.length : 0);
    console.log('Forced by timer:', forcedByTimer);
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    // Validate input
    if (!answers || !Array.isArray(answers)) {
      console.log('❌ Invalid answers format');
      return res.status(400).json({ error: 'Invalid answers format' });
    }

    if (!startedAt || !completedAt) {
      console.log('❌ Missing timestamps');
      return res.status(400).json({ error: 'Missing start or completion time' });
    }

    const quiz = await Quiz.findOne({
      _id: quizId,
      user_id: userId,
      is_deleted: false,
      status: 'completed',
    });

    if (!quiz) {
      console.log('❌ Quiz not found');
      return res.status(404).json({ error: 'Quiz not found' });
    }

    console.log('✓ Quiz found');
    console.log('Quiz questions count:', quiz.questions ? quiz.questions.length : 0);

    if (!quiz.questions || quiz.questions.length === 0) {
      console.log('❌ Quiz has no questions');
      return res.status(400).json({ error: 'Quiz has no questions' });
    }

    let correctCount = 0;
    let answeredCount = 0;
    
    const processedAnswers = answers.map((answer, index) => {
      try {
        console.log(`\nProcessing answer ${index + 1}:`, {
          question_id: answer.question_id,
          user_answer: answer.user_answer,
          user_answer_length: answer.user_answer ? answer.user_answer.length : 0
        });

        // Find question by ID
        let question = null;
        
        // Try different methods to find the question
        if (quiz.questions.id) {
          // Mongoose subdocument method
          try {
            question = quiz.questions.id(answer.question_id);
          } catch (e) {
            console.log('Could not use .id() method, trying .find()');
          }
        }
        
        if (!question) {
          // Array find method
          question = quiz.questions.find(q => {
            const qId = q._id ? q._id.toString() : q.toString();
            const aId = answer.question_id ? answer.question_id.toString() : answer.question_id;
            return qId === aId;
          });
        }

        if (!question) {
          console.warn(`⚠️ Question ${answer.question_id} not found in quiz`);
          return {
            question_id: answer.question_id,
            user_answer: answer.user_answer || '',
            is_correct: false,
            time_spent: answer.time_spent || 0,
          };
        }

        console.log('✓ Question found:', {
          question_text: question.question_text ? question.question_text.substring(0, 50) : 'N/A',
          correct_answer: question.correct_answer
        });

        // Check if question was answered
        const userAnswer = answer.user_answer || '';
        const wasAnswered = userAnswer.trim() !== '';
        
        if (wasAnswered) {
          answeredCount++;
        }

        // Check if answer is correct (case-insensitive comparison, trimmed)
        const userAnswerNormalized = userAnswer.trim().toLowerCase();
        const correctAnswerNormalized = (question.correct_answer || '').trim().toLowerCase();
        const isCorrect = wasAnswered && userAnswerNormalized === correctAnswerNormalized;
        
        if (isCorrect) {
          correctCount++;
        }

        console.log(`Result: ${wasAnswered ? 'answered' : 'skipped'} - ${isCorrect ? '✓ correct' : '✗ incorrect'}`);

        return {
          question_id: answer.question_id,
          user_answer: userAnswer,
          is_correct: isCorrect,
          time_spent: answer.time_spent || 0,
        };
      } catch (answerError) {
        console.error(`❌ Error processing answer ${index + 1}:`, answerError.message);
        // Return safe default
        return {
          question_id: answer.question_id,
          user_answer: answer.user_answer || '',
          is_correct: false,
          time_spent: answer.time_spent || 0,
        };
      }
    });

    // Calculate score
    const totalQuestions = quiz.questions.length;
    const score = totalQuestions > 0 
      ? Math.round((correctCount / totalQuestions) * 100) 
      : 0;

    // Calculate time taken
    const timeTaken = Math.floor(
      (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
    );

    console.log('\nQuiz Results Summary:');
    console.log('- Total questions:', totalQuestions);
    console.log('- Answered:', answeredCount);
    console.log('- Correct:', correctCount);
    console.log('- Score:', score + '%');
    console.log('- Time taken:', timeTaken, 'seconds');
    console.log('- Forced by timer:', forcedByTimer);

    const attemptData = {
      quiz_id: quizId,
      user_id: userId,
      answers: processedAnswers,
      score: score,
      total_questions: totalQuestions,
      correct_answers: correctCount,
      time_taken: timeTaken,
      started_at: new Date(startedAt),
      completed_at: new Date(completedAt),
      forced_by_timer: forcedByTimer || false,
    };

    console.log('\nCreating attempt with data:', {
      ...attemptData,
      answers: `[${attemptData.answers.length} answers]`
    });

    const attempt = await QuizAttempt.create(attemptData);

    console.log('✓ Attempt saved successfully, ID:', attempt._id);
    console.log('==================== SUBMIT COMPLETE ====================\n');

    res.status(201).json({
      message: 'Quiz submitted successfully',
      attempt: attempt,
      summary: {
        total: totalQuestions,
        answered: answeredCount,
        correct: correctCount,
        score: score,
        forcedByTimer: forcedByTimer || false,
      }
    });
  } catch (error) {
    console.error('\n❌❌❌ SUBMIT QUIZ ERROR ❌❌❌');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
    }
    
    console.error('==========================================\n');
    
    res.status(500).json({ 
      error: 'Failed to submit quiz',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      errorType: error.name
    });
  }
};

exports.getRecentFiles = async (req, res) => {
  try {
    const userId = req.user.id;

    const files = await UploadedFile.find({
      user_id: userId,
      is_deleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({ files });
  } catch (error) {
    console.error('Get Recent Files Error:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
};

exports.getQuizAttempt = async (req, res) => {
  try {
    const userId = req.user.id;
    const { attemptId } = req.params;

    const attempt = await QuizAttempt.findOne({
      _id: attemptId,
      user_id: userId,
      is_deleted: false,
    }).populate({
      path: 'quiz_id',
      select: 'title difficulty questions',
    });

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    res.status(200).json({ attempt });
  } catch (error) {
    console.error('Get Quiz Attempt Error:', error);
    res.status(500).json({ error: 'Failed to fetch attempt' });
  }
};

exports.getUserQuizHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const attempts = await QuizAttempt.find({
      user_id: userId,
      is_deleted: false,
    })
      .populate({
        path: 'quiz_id',
        select: 'title difficulty quiz_type',
      })
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({ attempts });
  } catch (error) {
    console.error('Get User Quiz History Error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz history' });
  }
};

// Get all quiz attempts for the user
exports.getAllUserAttempts = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('==================== FETCH ALL ATTEMPTS ====================');
    console.log('User ID:', userId);

    const attempts = await QuizAttempt.find({
      user_id: userId,
      is_deleted: false,
    })
      .populate({
        path: 'quiz_id',
        select: 'title difficulty quiz_type questions',
      })
      .sort({ completed_at: -1 }) // Sort by most recent first
      .lean(); // Convert to plain JavaScript objects

    console.log('✓ Found', attempts.length, 'attempts');
    console.log('==================== FETCH COMPLETE ====================\n');

    res.status(200).json({
      success: true,
      count: attempts.length,
      attempts: attempts,
    });

  } catch (error) {
    console.error('❌❌❌ GET ALL ATTEMPTS ERROR ❌❌❌');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==========================================\n');
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quiz attempts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get attempts for a specific quiz
exports.getQuizAttempts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { quizId } = req.params;

    console.log('==================== FETCH QUIZ ATTEMPTS ====================');
    console.log('User ID:', userId);
    console.log('Quiz ID:', quizId);

    const attempts = await QuizAttempt.find({
      user_id: userId,
      quiz_id: quizId,
      is_deleted: false,
    })
      .populate({
        path: 'quiz_id',
        select: 'title difficulty',
      })
      .sort({ completed_at: -1 })
      .lean();

    console.log('✓ Found', attempts.length, 'attempts for quiz');
    console.log('==================== FETCH COMPLETE ====================\n');

    res.status(200).json({
      success: true,
      count: attempts.length,
      attempts: attempts,
    });

  } catch (error) {
    console.error('❌❌❌ GET QUIZ ATTEMPTS ERROR ❌❌❌');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==========================================\n');
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quiz attempts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete/soft delete an attempt
exports.deleteAttempt = async (req, res) => {
  try {
    const userId = req.user.id;
    const { attemptId } = req.params;

    console.log('==================== DELETE ATTEMPT ====================');
    console.log('User ID:', userId);
    console.log('Attempt ID:', attemptId);

    const attempt = await QuizAttempt.findOneAndUpdate(
      {
        _id: attemptId,
        user_id: userId,
      },
      {
        is_deleted: true,
        deleted_at: new Date(),
      },
      { new: true }
    );

    if (!attempt) {
      console.log('❌ Attempt not found');
      return res.status(404).json({
        success: false,
        error: 'Quiz attempt not found',
      });
    }

    console.log('✓ Attempt deleted successfully');
    console.log('==================== DELETE COMPLETE ====================\n');

    res.status(200).json({
      success: true,
      message: 'Quiz attempt deleted successfully',
    });

  } catch (error) {
    console.error('❌❌❌ DELETE ATTEMPT ERROR ❌❌❌');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==========================================\n');
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete quiz attempt',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    console.log('==================== DELETE FILE ====================');
    console.log('User ID:', userId);
    console.log('File ID:', fileId);

    // Find and delete the file from database
    const file = await UploadedFile.findOneAndDelete({
      _id: fileId,
      user_id: userId,
    });

    if (!file) {
      console.log('❌ File not found');
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete physical file from disk
    try {
      await fs.unlink(file.file_path);
      console.log('✓ Physical file deleted from disk');
    } catch (err) {
      console.error('⚠️ Error deleting physical file:', err.message);
      // Continue even if physical file deletion fails
    }

    console.log('✓ File deleted successfully');
    console.log('==================== DELETE COMPLETE ====================\n');

    res.json({ 
      message: 'File deleted successfully',
      fileId: file._id 
    });
  } catch (error) {
    console.error('❌❌❌ DELETE FILE ERROR ❌❌❌');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==========================================\n');
    
    res.status(500).json({ error: 'Failed to delete file' });
  }
};

// Save quiz progress
exports.saveQuizProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { quizId } = req.params;
    const { currentQuestionIndex, answers, startTime, timeRemaining } = req.body;

    console.log('==================== SAVE QUIZ PROGRESS ====================');
    console.log('User ID:', userId);
    console.log('Quiz ID:', quizId);
    console.log('Progress:', { currentQuestionIndex, answersCount: Object.keys(answers).length, timeRemaining });

    // Store in a QuizProgress model (you'll need to create this)
    // For now, using a simple collection
    const QuizProgress = require('../models/QuizProgress'); // You'll need to create this model
    
    const progress = await QuizProgress.findOneAndUpdate(
      {
        quiz_id: quizId,
        user_id: userId,
        is_completed: false,
      },
      {
        current_question_index: currentQuestionIndex,
        answers: answers,
        start_time: startTime,
        time_remaining: timeRemaining,
        last_updated: new Date(),
      },
      {
        upsert: true,
        new: true,
      }
    );

    console.log('✓ Progress saved');
    console.log('==================== SAVE COMPLETE ====================\n');

    res.status(200).json({
      success: true,
      message: 'Progress saved',
    });

  } catch (error) {
    console.error('❌ SAVE PROGRESS ERROR:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to save progress',
    });
  }
};

// Get quiz progress
exports.getQuizProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { quizId } = req.params;

    console.log('==================== GET QUIZ PROGRESS ====================');
    console.log('User ID:', userId);
    console.log('Quiz ID:', quizId);

    const QuizProgress = require('../models/QuizProgress');
    
    const progress = await QuizProgress.findOne({
      quiz_id: quizId,
      user_id: userId,
      is_completed: false,
    });

    console.log('✓ Progress retrieved:', progress ? 'Found' : 'Not found');
    console.log('==================== GET COMPLETE ====================\n');

    res.status(200).json({
      success: true,
      progress: progress || null,
    });

  } catch (error) {
    console.error('❌ GET PROGRESS ERROR:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get progress',
    });
  }
};
