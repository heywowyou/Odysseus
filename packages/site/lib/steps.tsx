import { Reveal } from './reveal';

/**
 * An ordered sequence of stages (the home page's analysis-to-correction
 * handoff, the offer page's steps before the diagnostic), shared so the two
 * pages cannot drift apart the way their dossier cards once did.
 *
 * One raised panel divided into stages rather than a card per stage. Each
 * stage carries a short meter filled up to its own position, so the order
 * reads at a glance even across a wrapped row; the last stage fills in the
 * signal green of the dossier's Action row, because it is the stage where
 * the correction happens. The meter is decoration only (aria-hidden): the
 * ordered list already carries the sequence for assistive technology.
 */
export type Step = {
  title: string;
  text: string;
};

export function Steps({
  steps,
  className = '',
}: {
  steps: readonly Step[];
  className?: string;
}): React.JSX.Element {
  return (
    <Reveal as="ol" className={`process ${className}`.trim()}>
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="process-meter" aria-hidden="true">
            {steps.map((other, segment) => (
              <i key={other.title} className={segment <= index ? 'is-filled' : undefined} />
            ))}
          </span>
          <p className="process-step">{step.title}</p>
          <p className="process-text">{step.text}</p>
        </li>
      ))}
    </Reveal>
  );
}
