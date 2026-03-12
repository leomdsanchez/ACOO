import type { OperationalRepository } from "../ports/OperationalRepository.js";
import { ContactService } from "./ContactService.js";
import { FrontsService } from "./FrontsService.js";
import { ProjectService } from "./ProjectService.js";
import { TaskService } from "./TaskService.js";
import { ThreadService } from "./ThreadService.js";

export class OperationalWorkspace {
  public readonly contacts: ContactService;
  public readonly fronts: FrontsService;
  public readonly projects: ProjectService;
  public readonly tasks: TaskService;
  public readonly threads: ThreadService;

  public constructor(public readonly repository: OperationalRepository) {
    this.contacts = new ContactService(repository);
    this.fronts = new FrontsService(repository);
    this.projects = new ProjectService(repository);
    this.tasks = new TaskService(repository);
    this.threads = new ThreadService(repository);
  }
}
