import { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Field } from './ui';
import { Moon, StarField } from './Illustrations';
import { formatDuration, normalizeClock, parseHHmm, toHHmm } from '../lib/time';

export function Onboarding() {
  const { settings, updateSettings } = useStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(settings.name);
  const [goal, setGoal] = useState(settings.goalMin);
  const [wake, setWake] = useState(settings.targetWake);
  const bed = toHHmm(normalizeClock(parseHHmm(wake) - goal - 15));

  const finish = () =>
    updateSettings({
      name: name.trim(),
      goalMin: goal,
      targetWake: wake,
      targetBedtime: bed,
      smartAlarm: { ...settings.smartAlarm, time: wake },
      onboarded: true,
    });

  return (
    <div className="onboarding">
      <StarField count={90} />
      <div className="onboarding__card">
        <Moon size={110} />
        {step === 0 ? (
          <>
            <h1 className="onboarding__title">Welcome to Lumen</h1>
            <p className="onboarding__lead">A calm, private place to understand your sleep — built on what you log, never on guesses.</p>
            <ul className="onboarding__points">
              <li>Track nights with a tap at bedtime and wake-up, or log them later.</li>
              <li>See trends, consistency and a transparent Sleep Score.</li>
              <li>
                <ShieldCheck size={15} /> Your data stays on this device.
              </li>
            </ul>
            <Button variant="primary" size="lg" block onClick={() => setStep(1)} icon={<ArrowRight size={18} />}>
              Get started
            </Button>
          </>
        ) : (
          <>
            <h1 className="onboarding__title">Your sleep goal</h1>
            <div className="stack">
              <Field label="What should we call you?" htmlFor="ob-name">
                <input id="ob-name" className="input" value={name} placeholder="Optional" maxLength={40} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label={<>Nightly goal <strong className="field__value">{formatDuration(goal)}</strong></>} htmlFor="ob-goal">
                <input id="ob-goal" type="range" className="range" min={300} max={660} step={15} value={goal} onChange={(e) => setGoal(Number(e.target.value))} />
              </Field>
              <Field label="Usual wake-up time" htmlFor="ob-wake" hint={`Suggested bedtime: ${bed} (incl. ~15 min to fall asleep)`}>
                <input id="ob-wake" type="time" className="input input--time" value={wake} onChange={(e) => e.target.value && setWake(e.target.value)} />
              </Field>
              <p className="muted small">Most adults do well with 7–9 hours. You can change this anytime in Profile.</p>
              <Button variant="primary" size="lg" block onClick={finish}>
                Start tracking
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
