import { defineComponent } from 'vue';

export default defineComponent({
  template: `
    <div>
      <button>{{ $t('save') }}</button>
      <button>{{ $t('cancel') }}</button>
    </div>
  `,
});
