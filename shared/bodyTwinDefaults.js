// Default Body Twin shape. Agents should treat Body Twin as single source of truth.
export const defaultBodyTwin = {
  bodyStats: {
    heightCm: null,
    weightKg: null,
    bodyFatPct: null,
    muscleMassKg: null
  },
  fitnessGoal: {
    type: null
  },
  bodyType: null,
  dailyNutrition: {
    calories: null,
    protein: null,
    carbs: null,
    fat: null
  },
  mood: {
    moodScore: null,
    energyLevel: null,
    physicalComplaints: []
  },
  recoveryScore: null,
  workoutHistory: {
    streakDays: 0,
    lastWorkoutAt: null
  },
  // Nutrition gaps the grocery agent should optimize for.
  // Kept separate from `nutritionGaps` for forward compatibility with agent prompts.
  weeklyNutritionGaps: ['protein', 'iron', 'calcium'],
  nutritionGaps: [],
  budget: {
    dailyFoodBudgetRupees: null
  },
  equipmentAvailable: null,
  affordableMode: false,
  // 'veg' | 'non-veg' | 'vegan'
  dietaryPreference: 'veg',
  updatedAt: null
};

