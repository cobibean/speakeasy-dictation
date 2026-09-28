import type { JSX } from 'react';
import { BILLING_CATALOG } from '../../shared/billing-presentation';
import './plan-picker.css';

export type SelectedPlan = 'free' | 'standard' | 'pro';

export const PlanPicker = ({ onSelect, busyPlan = null, disabled = false }: {
  onSelect: (plan: SelectedPlan) => void;
  busyPlan?: SelectedPlan | null;
  disabled?: boolean;
}): JSX.Element => (
  <div className="plan-picker">
    <div className="plan-options" aria-label="Choose your plan">
      {BILLING_CATALOG.map((plan) => (
        <section className="plan-option" key={plan.id} aria-label={`${plan.name} plan`}>
          <h3>{plan.name}</h3>
          <p className="plan-price">{plan.price}</p>
          <p className="plan-allowance">{plan.allowance}</p>
          <button className={plan.id === 'free' ? 'secondary-button' : 'primary-button'}
            type="button" disabled={disabled || busyPlan !== null} onClick={() => onSelect(plan.id)}>
            {busyPlan === plan.id ? 'Opening Stripe…' : plan.id === 'free' ? 'Continue with Free' : `Choose ${plan.name}`}
          </button>
          <p className="plan-detail">{plan.id === 'free' ? 'No card needed.' : 'Billed monthly. Cancel anytime.'}</p>
        </section>
      ))}
    </div>
    <p className="plan-note">Every plan includes the same transcription and cleanup quality. Up to five minutes per recording. Practice is always free.</p>
    <p className="plan-note">Prices are in USD plus applicable tax. Stripe shows the total before you pay.</p>
  </div>
);
