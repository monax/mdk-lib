import { Context } from './context.js';

// Should exit immediately since a timeout should not hold Node process open
const func = async () => {
  // biome-ignore lint/correctness/noEmptyPattern: <explanation>
  const {} = Context.new('Wait', { timeoutMs: 1000_0000 });
};

func().catch((err) => console.error(err));
