'use client';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Register custom inline font sizes so that Quill uses `style="font-size: 16px"`
// instead of CSS classes like `class="ql-size-large"`
const Size = Quill.import('attributors/style/size');
Size.whitelist = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '32px'];
Quill.register(Size, true);

const Font = Quill.import('attributors/style/font');
Font.whitelist = ['sans-serif', 'serif', 'monospace', 'arial', 'courier', 'garamond', 'tahoma', 'times', 'verdana'];
Quill.register(Font, true);

export default function QuillEditor(props: any) {
  return <ReactQuill {...props} />;
}
