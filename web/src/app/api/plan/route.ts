import Anthropic from '@anthropic-ai/sdk';
import {NextResponse} from 'next/server';
import {z} from 'zod';

const client = new Anthropic();

const Input = z.object({
  idea: z.string().min(10).max(1000),
  audience: z.string().max(100).default('general audience'),
});

const PlanFromAI = z.object({
  title: z.string(),
  scenes: z
    .array(
      z.object({
        title: z.string(),
        narration: z.string(),
        durationSec: z.number().min(3).max(15),
        visualIdea: z.string(),
      }),
    )
    .min(3)
    .max(12),
});

const palette = [
  ['#1e6fd9', '#ffffff'],
  ['#5b8def', '#ffffff'],
  ['#3b4a63', '#ffffff'],
  ['#2e8b57', '#ffffff'],
  ['#c2571a', '#ffffff'],
  ['#6a3fa0', '#ffffff'],
];

export async function POST(req: Request) {
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({error: 'Please describe your idea in 10 to 1000 characters.'}, {status: 400});
  }
  const {idea, audience} = parsed.data;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 3000,
      system:
        'You plan short explainer videos for people who are not video experts. ' +
        'Always respond by calling the save_plan tool exactly once, and write nothing else. ' +
        'Create a clear, accurate, engaging plan of 5 to 8 scenes. Never invent statistics or facts. ' +
        'Write narration in plain English suited to the audience, 1 to 3 short sentences per scene.',
        tools: [
        {
          name: 'save_plan',
          description: 'Save the video plan.',
          input_schema: {
            type: 'object',
            properties: {
              title: {type: 'string'},
              scenes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: {type: 'string', description: 'Short on-screen heading, max 8 words'},
                    narration: {type: 'string', description: 'What the narrator says in this scene'},
                    durationSec: {type: 'number', description: 'Scene length in seconds, 4 to 12'},
                    visualIdea: {type: 'string', description: 'What picture would illustrate this scene'},
                  },
                  required: ['title', 'narration', 'durationSec', 'visualIdea'],
                },
              },
            },
            required: ['title', 'scenes'],
          },
        },
      ],
      
      messages: [{role: 'user', content: `Idea: ${idea}\nAudience: ${audience}`}],
    });

    const block = response.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') throw new Error('No plan returned');
    const ai = PlanFromAI.parse(block.input);

    const plan = {
      title: ai.title,
      fps: 30,
      width: 1280,
      height: 720,
      scenes: ai.scenes.map((s, i) => ({
        id: `s${i + 1}`,
        ...s,
        background: palette[i % palette.length][0],
        textColor: palette[i % palette.length][1],
      })),
    };
    return NextResponse.json({plan});
  } catch (e) {
    console.error(e);
    return NextResponse.json({error: 'Could not create a plan right now. Please try again.'}, {status: 500});
  }
}