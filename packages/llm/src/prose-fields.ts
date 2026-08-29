/** One named piece of model-written prose. Lets a guard be written once
 *  against text rather than once per output shape - the writing pass and
 *  the outreach pass both produce guardable prose, but as differently
 *  shaped objects, and a guard should not need to know which. */
export interface ProseField {
  field: string;
  text: string;
}
