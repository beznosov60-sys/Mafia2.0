import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useClientsStore } from '../../stores/clientsStore';
import { STAGE_ORDER, SUB_STAGES } from '../../constants/stages';

export default {
  name: 'AddClientPage',
  setup() {
    const router = useRouter();
    const clientsStore = useClientsStore();
    const errors = ref([]);
    const form = reactive({
      fullName: '',
      phone: '',
      email: '',
      city: '',
      stage: STAGE_ORDER[0],
      subStage: SUB_STAGES[STAGE_ORDER[0]][0],
      managerName: '',
      managerPhone: '',
      courtDate: '',
      courtTitle: '',
      courtTypeArbitration: false,
      courtTypeTret: false,
      contractAmount: '',
      notes: ''
    });

    const subStages = computed(() => SUB_STAGES[form.stage] || []);

    watch(
      () => form.stage,
      () => {
        if (!subStages.value.includes(form.subStage)) {
          form.subStage = subStages.value[0] || '';
        }
      }
    );

    function validate() {
      const validationErrors = [];
      if (!form.fullName.trim()) {
        validationErrors.push('Укажите имя и фамилию клиента.');
      }
      if (!form.stage) {
        validationErrors.push('Выберите стадию.');
      }
      return validationErrors;
    }

    function handleSubmit() {
      errors.value = validate();
      if (errors.value.length) {
        return;
      }

      const managerName = form.managerName.trim();
      const managerPhone = form.managerPhone.trim();
      const managerId = managerName ? `M-${Date.now()}` : 'unknown';

      const id = clientsStore.addClient({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        city: form.city.trim(),
        stage: form.stage,
        subStage: form.subStage,
        manager: managerName
          ? {
              id: managerId,
              name: managerName,
              phone: managerPhone
            }
          : undefined,
        court:
          form.courtDate || form.courtTitle
            ? {
                date: form.courtDate || null,
                title: form.courtTitle || '',
                type: [
                  form.courtTypeArbitration ? 'АС' : null,
                  form.courtTypeTret ? 'ТС' : null
                ]
                  .filter(Boolean)
                  .join('/') || null
              }
            : null,
        courtTypes: {
          arbitration: form.courtTypeArbitration,
          tret: form.courtTypeTret
        },
        finances: {
          contractAmount: form.contractAmount ? Number(form.contractAmount) : 0,
          payments: [],
          expenses: []
        },
        notes: form.notes.trim()
      });

      router.push({ name: 'client-card', params: { id } });
    }

    function cancel() {
      router.back();
    }

    return {
      form,
      errors,
      stages: STAGE_ORDER,
      subStages,
      handleSubmit,
      cancel
    };
  }
};
