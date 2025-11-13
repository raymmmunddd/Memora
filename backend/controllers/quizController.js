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
  
  const prompt = `You are an expert educational quiz generator. Generate ${settings.numQuestions} ${settings.difficulty} difficulty ${settings.quiz_type} questions based on the following study materials.

STUDY MATERIALS:
${truncatedText}

Generate ${settings.numQuestions} questions in JSON array format. Each question must have:
- question_text: the question
- question_type: "${settings.quiz_type}"
- options: ${settings.quiz_type === 'multiple-choice' ? 'array of 4 choices' : 'empty array []'}
- correct_answer: the correct answer${settings.quiz_type === 'multiple-choice' ? ' (must match one of the options exactly)' : ''}
- explanation: brief explanation of the answer

Example:
[
  {
    "question_text": "What is the capital of France?",
    "question_type": "${settings.quiz_type}",
    "options": ${settings.quiz_type === 'multiple-choice' ? '["Paris", "London", "Berlin", "Madrid"]' : '[]'},
    "correct_answer": "Paris",
    "explanation": "Paris is the capital and largest city of France."
  }
]`;

  try {
    console.log('→ Calling Gemini API...');
    
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
    console.log('Full API response:', JSON.stringify(data, null, 2));
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ Unexpected API response structure:', data);
      throw new Error('Invalid response structure from Gemini API');
    }
    
    let textContent = data.candidates[0].content.parts[0].text;
    console.log('Raw AI response:', textContent);
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
        console.error('Full text content:', textContent);
        throw new Error('AI response does not contain a JSON array');
      }
      
      textContent = textContent.substring(firstBracket, lastBracket + 1);
      textContent = textContent.replace(/[""]/g, '"').replace(/['']/g, "'");
      textContent = textContent.replace(/,(\s*[}\]])/g, '$1');
      
      console.log('Cleaned text:', textContent.substring(0, 500));
      
      try {
        questions = JSON.parse(textContent);
        console.log('✓ JSON parse successful after cleanup');
      } catch (secondError) {
        console.error('❌ JSON Parse Error after cleanup:', secondError.message);
        console.error('Failed text:', textContent);
        throw new Error(`JSON parsing failed: ${secondError.message}`);
      }
    }

    console.log('Parsed data type:', typeof questions, Array.isArray(questions));
    console.log('Parsed data:', JSON.stringify(questions, null, 2));
    
    if (!Array.isArray(questions)) {
      console.error('❌ Response is not an array, got:', typeof questions);
      console.error('Data structure:', questions);
      throw new Error(`Generated response is not an array. Got: ${typeof questions}`);
    }
    
    if (questions.length === 0) {
      console.error('❌ Questions array is empty');
      throw new Error('Generated questions array is empty');
    }

    console.log('Raw questions count:', questions.length);

    const validQuestions = questions.filter(q => {
      const hasQuestionText = q && q.question_text && typeof q.question_text === 'string';
      const hasQuestionType = q && q.question_type;
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
      console.error('Original questions:', JSON.stringify(questions, null, 2));
      throw new Error('No valid questions found in AI response');
    }

    const requestedNum = parseInt(settings.numQuestions);
    if (validQuestions.length < requestedNum * 0.5) {
      console.error(`❌ Only ${validQuestions.length} valid questions out of ${requestedNum} requested`);
      throw new Error(`Only generated ${validQuestions.length} valid questions out of ${requestedNum} requested`);
    }

    console.log('✓ Parsed', validQuestions.length, 'valid questions');
    console.log('==================== AI GENERATION END ====================\n');

    return validQuestions.slice(0, requestedNum);
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
    const { fileIds, quizType, numQuestions, difficulty, timeLimit } = req.body;

    console.log('==================== QUIZ GENERATION START ====================');
    console.log('User ID:', userId);
    console.log('File IDs:', fileIds);
    console.log('Settings:', { quizType, numQuestions, difficulty, timeLimit });

    if (!fileIds || fileIds.length === 0) {
      return res.status(400).json({ error: 'No files selected' });
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

    const quiz = await Quiz.create({
      user_id: userId,
      title: `Quiz - ${new Date().toLocaleDateString()}`,
      quiz_type: quizType,
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

    const settings = {
      quiz_type: quizType,
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
      .sort({ createdAt: -1 })
      .select('-questions');

    res.status(200).json({ quizzes });
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
    const { answers, startedAt, completedAt } = req.body;

    const quiz = await Quiz.findOne({
      _id: quizId,
      user_id: userId,
      is_deleted: false,
      status: 'completed',
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    let correctCount = 0;
    const processedAnswers = answers.map((answer) => {
      const question = quiz.questions.id(answer.question_id);
      const isCorrect = question.correct_answer === answer.user_answer;
      if (isCorrect) correctCount++;

      return {
        question_id: answer.question_id,
        user_answer: answer.user_answer,
        is_correct: isCorrect,
        time_spent: answer.time_spent || 0,
      };
    });

    const score = Math.round((correctCount / quiz.questions.length) * 100);
    const timeTaken = Math.floor((new Date(completedAt) - new Date(startedAt)) / 1000);

    const attempt = await QuizAttempt.create({
      quiz_id: quizId,
      user_id: userId,
      answers: processedAnswers,
      score: score,
      total_questions: quiz.questions.length,
      correct_answers: correctCount,
      time_taken: timeTaken,
      started_at: startedAt,
      completed_at: completedAt,
    });

    res.status(201).json({
      message: 'Quiz submitted successfully',
      attempt: attempt,
    });
  } catch (error) {
    console.error('Submit Quiz Error:', error);
    res.status(500).json({ error: 'Failed to submit quiz' });
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