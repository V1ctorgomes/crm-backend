import { Module } from '@nestjs/common';



import { TicketsService } from './tickets.service';



import { TicketsController } from './tickets.controller';



import { PrismaModule } from '../prisma/prisma.module';



import { StorageModule } from '../storage/storage.module';



import { AuthModule } from '../auth/auth.module';



import { TicketCatalogModule } from '../ticket-catalog/ticket-catalog.module';



import { DeletionAuditModule } from '../deletion-audit/deletion-audit.module';



import { TicketAccessService } from './ticket-access.service';



import { TicketCompanyResolverService } from './ticket-company-resolver.service';



import { TicketStagesService } from './ticket-stages.service';



import { TicketBoardService } from './ticket-board.service';



import { TicketFilesService } from './ticket-files.service';



import { TicketLifecycleService } from './ticket-lifecycle.service';



import { TicketCreateService } from './ticket-create.service';



import { TicketUpdateService } from './ticket-update.service';



import { TicketQueryService } from './ticket-query.service';



import { TicketNotesService } from './ticket-notes.service';



import { TicketTasksService } from './ticket-tasks.service';







@Module({



  imports: [PrismaModule, AuthModule, TicketCatalogModule, DeletionAuditModule, StorageModule],



  providers: [



    TicketsService,



    TicketAccessService,



    TicketCompanyResolverService,



    TicketStagesService,



    TicketBoardService,



    TicketFilesService,



    TicketLifecycleService,



    TicketCreateService,



    TicketUpdateService,



    TicketQueryService,



    TicketNotesService,



    TicketTasksService,



  ],



  controllers: [TicketsController],



})



export class TicketsModule {}

