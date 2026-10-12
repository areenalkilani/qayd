import { Body, Controller, Get, Inject, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Db } from './db';
import { requireOffice } from './policy';
import { AuthRequest, OfficePermission } from './security';
import { pageSchema, parse } from './validation';
const id=z.string().uuid();
@ApiTags('Internal messages') @Controller('messages') export class MessagesController{
 constructor(@Inject(Db) private db:Db){}
 @OfficePermission('cases.read') @Get() async list(@Req() req:AuthRequest,@Query() query:unknown){const v=parse(pageSchema,query);const officeId=requireOffice(req.user);const where={officeId,recipients:{some:{userId:req.user.id}}};const [items,total]=await this.db.$transaction([this.db.officeMessage.findMany({where,include:{sender:{select:{fullName:true}},recipients:{where:{userId:req.user.id},select:{readAt:true}}},orderBy:{createdAt:'desc'},skip:(v.page-1)*20,take:20}),this.db.officeMessage.count({where})]);return{items:items.map(x=>({...x,readAt:x.recipients[0]?.readAt||null})),total,page:v.page,pageSize:20}}
 @OfficePermission('cases.read') @Post() async send(@Req() req:AuthRequest,@Body() body:unknown){const v=parse(z.object({subject:z.string().trim().max(200).default(''),body:z.string().trim().min(1).max(5000),recipientIds:z.array(id).max(100).default([]),all:z.boolean().default(false)}).strict(),body);const officeId=requireOffice(req.user);if(!v.all&&!v.recipientIds.length)throw new Error('Select at least one recipient');const users=await this.db.user.findMany({where:{officeId,status:'ACTIVE',...(v.all?{}:{id:{in:v.recipientIds}})},select:{id:true}});if((!v.all&&users.length!==v.recipientIds.length)||!users.length)throw new Error('Recipients must belong to your office');return this.db.$transaction(async tx=>{const item=await tx.officeMessage.create({data:{officeId,senderId:req.user.id,subject:v.subject,body:v.body,isAnnouncement:v.all,recipients:{create:users.map(u=>({userId:u.id}))}}});await tx.audit.create({data:{officeId,actorId:req.user.id,action:v.all?'MESSAGE_ANNOUNCEMENT_SENT':'MESSAGE_SENT',targetId:item.id,metadata:{recipients:users.length}}});return{ok:true}})}
 @OfficePermission('cases.read') @Post(':id/read') async read(@Req() req:AuthRequest,@Body() _body:unknown){return {ok:true}}
}
