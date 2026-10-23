import {
  userDatabase,
  jsonError,
  HttpError,
  dbResult,
  readJson,
} from '@/lib/api';
import { embedTexts, answerQuestion, ANSWER_UNAVAILABLE } from '@/lib/ai';
import { mapCitations } from '@/lib/chunk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function POST(request) {
  let db;
  let createdConversationId = null;

  try {
    const context = await userDatabase(request);
    db = context.db;
    const { user } = context;

    const payload = await readJson(request);
    const question =
      typeof payload.question === 'string' ? payload.question.trim() : '';

    if (question.length < 3 || question.length > 1500) {
      throw new HttpError(
        400,
        'Ask a question between 3 and 1,500 characters',
      );
    }

    let conversation = null;
    let selectedIds;
    let history = [];

    if (payload.conversationId) {
      if (!uuid.test(payload.conversationId)) {
        throw new HttpError(400, 'Invalid conversation');
      }

      conversation = dbResult(
        await db
          .from('conversations')
          .select('id,document_ids,title')
          .eq('id', payload.conversationId)
          .maybeSingle(),
      );

      if (!conversation) {
        throw new HttpError(404, 'Conversation not found');
      }

      selectedIds = conversation.document_ids;

      const previous = dbResult(
        await db
          .from('messages')
          .select('role,content')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(6),
      );

      history = previous.reverse();
    } else {
      selectedIds = [
        ...new Set(
          Array.isArray(payload.documentIds) ? payload.documentIds : [],
        ),
      ];

      if (
        !selectedIds.length ||
        selectedIds.length > 12 ||
        selectedIds.some((id) => typeof id !== 'string' || !uuid.test(id))
      ) {
        throw new HttpError(400, 'Select between 1 and 12 documents');
      }
    }

    if (!selectedIds.length) {
      throw new HttpError(400, 'This conversation has no documents');
    }

    const docs = dbResult(
      await db
        .from('documents')
        .select('id,filename,status')
        .in('id', selectedIds),
    );

    if (
      docs.length !== selectedIds.length ||
      docs.some((doc) => doc.status !== 'ready')
    ) {
      throw new HttpError(
        400,
        'A selected document is missing or not ready',
      );
    }

    const [vector] = await embedTexts([question]);

    const found = dbResult(
      await db.rpc('match_document_chunks', {
        query_embedding: `[${vector.join(',')}]`,
        filter_document_ids: selectedIds,
        match_count: 8,
      }),
    );

    const matches = (found || []).filter((item) => item.similarity >= 0.24);

    const model = matches.length
      ? await answerQuestion(question, matches, history)
      : {
          answer: ANSWER_UNAVAILABLE,
          citations: [],
          answerable: false,
        };

    const citations = model.answerable
      ? mapCitations(model.citations, matches)
      : [];

    const answer = citations.length ? model.answer : ANSWER_UNAVAILABLE;

    if (!conversation) {
      conversation = dbResult(
        await db
          .from('conversations')
          .insert({
            user_id: user.id,
            title: question.slice(0, 74),
            document_ids: selectedIds,
          })
          .select('id,title,document_ids')
          .single(),
      );

      createdConversationId = conversation.id;
    }

    const savedAt = Date.now();

    const inserted = dbResult(
      await db
        .from('messages')
        .insert([
          {
            user_id: user.id,
            conversation_id: conversation.id,
            role: 'user',
            content: question,
            citations: [],
            created_at: new Date(savedAt).toISOString(),
          },
          {
            user_id: user.id,
            conversation_id: conversation.id,
            role: 'assistant',
            content: answer,
            citations,
            created_at: new Date(savedAt + 1).toISOString(),
          },
        ])
        .select('id,role,content,citations,created_at'),
    );

    dbResult(
      await db
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversation.id),
    );

    return Response.json(
      { conversation, messages: inserted, answer, citations },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (db && createdConversationId) {
      try {
        const cleanup = await db
          .from('conversations')
          .delete()
          .eq('id', createdConversationId);

        if (cleanup.error) {
          console.error(
            'Failed to clean up an empty conversation:',
            cleanup.error.message,
          );
        }
      } catch (cleanupError) {
        console.error('Failed to clean up an empty conversation.');
      }
    }

    return jsonError(error);
  }
}