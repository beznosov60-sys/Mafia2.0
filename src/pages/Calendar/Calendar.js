import { computed, ref } from 'vue';
import { useClientsStore } from '../../stores/clientsStore';
import { STAGE_COLORS } from '../../constants/stages';

function formatMonthLabel(value) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function toMonthKey(date) {
  const current = new Date(date);
  if (Number.isNaN(current.getTime())) {
    return null;
  }
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
}

export default {
  name: 'CalendarPage',
  setup() {
    const clientsStore = useClientsStore();
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const selectedMonth = ref(currentMonthKey);

    const calendarEvents = computed(() => {
      return clientsStore.clients
        .flatMap(client => {
          const events = [];
          if (client.court?.date) {
            events.push({
              id: `${client.id}-court`,
              clientId: client.id,
              clientName: client.fullName,
              type: 'court',
              title: client.court.title || 'Судебное заседание',
              date: client.court.date,
              stage: client.stage,
              manager: client.manager?.name || 'Не назначен'
            });
          }
          (client.tasks || []).forEach(task => {
            if (!task.dueDate) {
              return;
            }
            events.push({
              id: `${client.id}-task-${task.id}`,
              clientId: client.id,
              clientName: client.fullName,
              type: 'task',
              title: task.title,
              date: task.dueDate,
              stage: client.stage,
              manager: client.manager?.name || 'Не назначен',
              completed: Boolean(task.completed)
            });
          });
          return events;
        })
        .filter(event => Boolean(toMonthKey(event.date)))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    });

    const monthOptions = computed(() => {
      const unique = new Map();
      calendarEvents.value.forEach(event => {
        const key = toMonthKey(event.date);
        if (!key || unique.has(key)) {
          return;
        }
        unique.set(key, formatMonthLabel(key));
      });
      return Array.from(unique.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([value, label]) => ({ value, label }));
    });

    const eventsByMonth = computed(() => {
      const result = new Map();
      calendarEvents.value.forEach(event => {
        const key = toMonthKey(event.date);
        if (!key) {
          return;
        }
        if (!result.has(key)) {
          result.set(key, []);
        }
        result.get(key).push(event);
      });
      return result;
    });

    const visibleEvents = computed(() => {
      const events = eventsByMonth.value.get(selectedMonth.value) || [];
      return events.map(event => ({
        ...event,
        dateLabel: new Date(event.date).toLocaleDateString('ru-RU', {
          day: 'numeric',
          month: 'long'
        }),
        color: STAGE_COLORS[event.stage] || '#4f46e5'
      }));
    });

    function selectMonth(value) {
      selectedMonth.value = value;
    }

    function isToday(date) {
      const current = new Date(date);
      return (
        current.getDate() === today.getDate() &&
        current.getMonth() === today.getMonth() &&
        current.getFullYear() === today.getFullYear()
      );
    }

    return {
      selectedMonth,
      monthOptions,
      visibleEvents,
      formatMonthLabel,
      selectMonth,
      isToday
    };
  }
};
