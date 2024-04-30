import { Context } from './context.js';

// Pseudo test that should hang forever provided Context holds Node open once wait() is called
const func = async () => {
  const { ctx } = Context.new('Wait');
  const p = ctx.wait();
  console.log('begin');
  await p;
  console.log('end');
};

func().catch((err) => console.error(err));
