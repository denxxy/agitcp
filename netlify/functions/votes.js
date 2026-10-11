/**
 * Netlify Serverless Function: votes.js
 * 
 * Обработчик счетчика голосов предвыборной кампании.
 * Подключается к Netlify DB (PostgreSQL / Neon) через защищенный HTTPS SQL API.
 * 
 * Эндпоинты:
 * GET  /api/votes            -> { success: true, count: 0 }
 * POST /api/votes (vote)    -> { success: true, count: 1 }
 * POST /api/votes (unvote)  -> { success: true, count: 0 }
 */

const FALLBACK_DB_URL = 'postgresql://netlifydb_owner:npg_FS7tiCvW2uon@ep-curly-lake-b56agdrk.c-7.us-east-2.db.netlify.com/netlifydb?sslmode=require';
const DB_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || FALLBACK_DB_URL;

let isInitialized = false;

function getSqlEndpoint(connectionString) {
  try {
    const url = new URL(connectionString.replace(/^postgres(ql)?:/, 'http:'));
    return `https://${url.host}/sql`;
  } catch (e) {
    return 'https://ep-curly-lake-b56agdrk.c-7.us-east-2.db.netlify.com/sql';
  }
}

async function executeSql(query) {
  const endpoint = getSqlEndpoint(DB_URL);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Neon-Connection-String': DB_URL,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Database error [${response.status}]: ${errorBody}`);
  }

  return await response.json();
}

async function ensureTableInitialized() {
  if (isInitialized) return;
  try {
    await executeSql('CREATE TABLE IF NOT EXISTS candidate_votes (id INT PRIMARY KEY DEFAULT 1, count INT NOT NULL DEFAULT 0);');
    await executeSql('INSERT INTO candidate_votes (id, count) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;');
    isInitialized = true;
  } catch (e) {
    console.warn('Init check notice:', e.message);
  }
}

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  try {
    await ensureTableInitialized();

    // 1. Получение текущего количества голосов
    if (event.httpMethod === 'GET') {
      const result = await executeSql('SELECT count FROM candidate_votes WHERE id = 1;');
      const count = result.rows && result.rows.length > 0 ? Number(result.rows[0].count) : 0;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, count })
      };
    }

    // 2. Отдача или отзыв голоса
    if (event.httpMethod === 'POST') {
      let body = {};
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
      } catch (e) {
        body = {};
      }

      const action = body.action || 'vote';
      let sqlQuery = '';

      if (action === 'vote') {
        sqlQuery = 'UPDATE candidate_votes SET count = count + 1 WHERE id = 1 RETURNING count;';
      } else if (action === 'unvote') {
        sqlQuery = 'UPDATE candidate_votes SET count = GREATEST(0, count - 1) WHERE id = 1 RETURNING count;';
      } else {
        sqlQuery = 'SELECT count FROM candidate_votes WHERE id = 1;';
      }

      const result = await executeSql(sqlQuery);
      const count = result.rows && result.rows.length > 0 ? Number(result.rows[0].count) : 0;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, count, action })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' })
    };
  } catch (err) {
    console.error('Votes function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
