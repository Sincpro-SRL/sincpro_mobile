import { interceptInstance } from "@sincpro/mobile/infrastructure/interceptor/intercept";
import { tracingHooks } from "@sincpro/mobile/infrastructure/telemetry/tracing/tracing_hooks";

/**
 * One operation. What the context injects (a repository, an adapter) is `deps`,
 * typed by the subclass.
 *
 * `new` returns a proxy: every public method of the subclass runs inside a span
 * named `ClassName.method`. A name that starts with `_` does not. The author
 * does not open a span. If tracing is not initialized, or the exporter fails,
 * the method still runs.
 *
 * A subclass constructor calls `super(deps)` and does not return another object.
 */
export class Feature<Deps extends object = Record<string, never>> {
  protected readonly deps: Deps;

  constructor(deps?: Deps) {
    this.deps = deps ?? ({} as Deps);
    return interceptInstance(this, tracingHooks(new.target.name), {
      skip: (methodName) => methodName.startsWith("_"),
    });
  }
}

/**
 * Composes the `Feature`s of its own context. `features` is that set, and only
 * that set: another context's feature is not on the type.
 *
 * `run` is the parent span. Each `this.features.*` call in that turn is a child
 * of the same trace. It does not call another `ApplicationService`.
 */
export class ApplicationService<
  TFeatures extends Record<string, Feature<Record<string, unknown>>>,
  Deps extends object = Record<string, never>,
> extends Feature<Deps> {
  protected readonly features: TFeatures;

  constructor(features: TFeatures, deps?: Deps) {
    super(deps);
    this.features = features;
  }
}
